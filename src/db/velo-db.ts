import Dexie, { type Table } from "dexie"
import type { AppMeta, KnowledgeNode, LearningPeriod, LegacyPlanTask, NoteDocument, PlanTask, PlanTaskGroup } from "./types"

export class VeloDB extends Dexie {
  planTasks!: Table<PlanTask, string>
  planTaskGroups!: Table<PlanTaskGroup, string>
  learningPeriods!: Table<LearningPeriod, string>
  legacyPlanTasks!: Table<LegacyPlanTask, string>
  knowledgeNodes!: Table<KnowledgeNode, string>
  notes!: Table<NoteDocument, string>
  appMeta!: Table<AppMeta, string>

  constructor(name: string) {
    super(name)

    this.version(1).stores({
      planTasks: "id, [scope+periodKey], periodKey, isCompleted, order, updatedAt",
      knowledgeNodes: "id, parentId, type, order, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })

    this.version(2)
      .stores({
        planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], isCompleted, updatedAt",
        learningPeriods: "id, kind, startDate, endDate, updatedAt",
        legacyPlanTasks: "id, scope, periodKey, updatedAt",
        knowledgeNodes: "id, parentId, type, order, updatedAt",
        notes: "id, nodeId, title, updatedAt",
        appMeta: "key, updatedAt",
      })
      .upgrade(async (transaction) => {
        const table = transaction.table<LegacyPlanTask, string>("planTasks")
        const legacyTable = transaction.table<LegacyPlanTask, string>("legacyPlanTasks")
        const rows = await table.toArray()
        for (const row of rows) {
          if (row.scope === "day" && isValidLegacyDayKey(row.periodKey)) {
            await table.put({
              id: row.id,
              title: row.title,
              scheduledDate: row.periodKey,
              subject: row.subject,
              estimatedMinutes: row.estimatedMinutes,
              isCompleted: row.isCompleted,
              completedAt: row.isCompleted === 1 ? row.updatedAt : undefined,
              order: row.order,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            } as unknown as LegacyPlanTask)
          } else {
            await legacyTable.put(row)
            await table.delete(row.id)
          }
        }
      })

    this.version(3).stores({
      planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], groupId, [groupId+stepIndex], isCompleted, updatedAt",
      planTaskGroups: "id, startDate, endDate, updatedAt",
      learningPeriods: "id, kind, startDate, endDate, updatedAt",
      legacyPlanTasks: "id, scope, periodKey, updatedAt",
      knowledgeNodes: "id, parentId, type, order, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })
  }
}

function isValidLegacyDayKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export const veloDb = new VeloDB("velo")
