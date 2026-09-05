import type { NoteDocument, PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { formatLocalDate } from "@/lib/local-date"

export interface HomeSnapshot {
  completedCount: number
  totalCount: number
  nextTask: PlanTask | null
  recentNote: NoteDocument | null
}

export async function loadHomeSnapshot(db: VeloDB, now: Date): Promise<HomeSnapshot> {
  const periodKey = formatLocalDate(now)
  const tasks = await db.planTasks.where("[scope+periodKey]").equals(["day", periodKey]).sortBy("order")
  const recentNotes = await db.notes.orderBy("updatedAt").reverse().toArray()
  let recentNote: NoteDocument | null = null
  for (const note of recentNotes) {
    const node = await db.knowledgeNodes.get(note.nodeId)
    if (!node || node.deletedAt === undefined) {
      recentNote = note
      break
    }
  }

  return {
    completedCount: tasks.filter((task) => task.isCompleted === 1).length,
    totalCount: tasks.length,
    nextTask: tasks.find((task) => task.isCompleted === 0) ?? null,
    recentNote,
  }
}
