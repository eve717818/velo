import { describe, expect, it } from "vitest"
import type { NoteDocument, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import { loadHomeSnapshot } from "./home-query"

const now = new Date(2026, 7, 25, 9, 0)

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-home-query-${crypto.randomUUID()}`)

  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

function task(overrides: Partial<PlanTask> & Pick<PlanTask, "id" | "title">): PlanTask {
  return {
    scope: "day",
    periodKey: "2026-08-25",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function note(overrides: Partial<NoteDocument> & Pick<NoteDocument, "id" | "title">): NoteDocument {
  return {
    nodeId: `${overrides.id}-node`,
    content: { type: "doc" },
    plainText: overrides.title,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("loadHomeSnapshot", () => {
  it("summarizes today's daily tasks and selects the next task and latest note", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "done-1", title: "完成一", isCompleted: 1, order: 4 }),
        task({ id: "next-later", title: "稍后", order: 9 }),
        task({ id: "done-2", title: "完成二", isCompleted: 1, order: 2 }),
        task({ id: "next-first", title: "下一项", order: 5 }),
        task({ id: "done-3", title: "完成三", isCompleted: 1, order: 3 }),
        task({ id: "other-day", title: "明天", periodKey: "2026-08-26", isCompleted: 1, order: 1 }),
        task({ id: "week", title: "本周复盘", scope: "week", periodKey: "2026-08-24", isCompleted: 1, order: 1 }),
        task({ id: "month", title: "八月总结", scope: "month", periodKey: "2026-08", isCompleted: 1, order: 1 }),
        task({ id: "semester", title: "长期论文", scope: "semester", periodKey: "fall-2026", isCompleted: 1, order: 1 }),
      ])
      await db.notes.bulkAdd([
        note({ id: "older-note", title: "较早笔记", updatedAt: 10 }),
        note({ id: "recent-note", title: "最新笔记", updatedAt: 20 }),
      ])

      const snapshot = await loadHomeSnapshot(db, now)

      expect(snapshot.completedCount).toBe(3)
      expect(snapshot.totalCount).toBe(5)
      expect(snapshot.nextTask).toMatchObject({ id: "next-first", order: 5 })
      expect(snapshot.recentNote).toMatchObject({ id: "recent-note", updatedAt: 20 })
    })
  })

  it("returns zero and null values for an empty database", async () => {
    await withDatabase(async (db) => {
      await expect(loadHomeSnapshot(db, now)).resolves.toEqual({
        completedCount: 0,
        totalCount: 0,
        nextTask: null,
        recentNote: null,
      })
    })
  })
})
