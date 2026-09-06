import Dexie, { type Table } from "dexie"
import { assertValidPlanPeriodKey } from "../features/plans/domain/plan-period-keys"
import { migrateLegacyKnowledgeTree } from "../features/notes/knowledge-tree-model"
import type {
  AppMeta,
  KnowledgeNode,
  LearningPeriod,
  LegacyKnowledgeNode,
  LegacyPlanTask,
  NoteDocument,
  PlanTask,
  PlanTaskGroup,
  RangePlan,
} from "./types"

type VersionFourPlanTaskRow = {
  id: string
  scheduledDate?: unknown
  startMinutes?: number
  groupId?: unknown
  stepIndex?: unknown
  stepTitleMode?: unknown
  [key: string]: unknown
}

export class VeloDB extends Dexie {
  planTasks!: Table<PlanTask, string>
  planTaskGroups!: Table<PlanTaskGroup, string>
  rangePlans!: Table<RangePlan, string>
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

    this.version(4).stores({
      planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], groupId, [groupId+stepIndex], isCompleted, updatedAt",
      planTaskGroups: "id, startDate, endDate, updatedAt",
      rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
      learningPeriods: "id, kind, startDate, endDate, updatedAt",
      legacyPlanTasks: "id, scope, periodKey, updatedAt",
      knowledgeNodes: "id, parentId, type, order, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })

    this.version(5)
      .stores({
        planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
        planTaskGroups: "id, startDate, endDate, updatedAt",
        rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
        learningPeriods: "id, kind, startDate, endDate, updatedAt",
        legacyPlanTasks: "id, scope, periodKey, updatedAt",
        knowledgeNodes: "id, parentId, type, order, updatedAt",
        notes: "id, nodeId, title, updatedAt",
        appMeta: "key, updatedAt",
      })
      .upgrade(async (transaction) => {
        const tasks = transaction.table<VersionFourPlanTaskRow, string>("planTasks")
        for (const row of await tasks.toArray()) {
          const { scheduledDate, ...rest } = row
          delete rest.groupId
          delete rest.stepIndex
          delete rest.stepTitleMode
          if (typeof scheduledDate !== "string") throw new Error("v4 任务日期缺失")
          assertValidPlanPeriodKey("day", scheduledDate)
          await tasks.put({ ...rest, scope: "day", periodKey: scheduledDate, startMinutes: row.startMinutes })
        }
      })

    this.version(6)
      .stores({
        planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
        planTaskGroups: "id, startDate, endDate, updatedAt",
        rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
        learningPeriods: "id, kind, startDate, endDate, updatedAt",
        legacyPlanTasks: "id, scope, periodKey, updatedAt",
        knowledgeNodes: "id, parentId, type, order, inbox, deletedAt, trashRootId, updatedAt",
        notes: "id, nodeId, title, updatedAt",
        appMeta: "key, updatedAt",
      })
      .upgrade(async (transaction) => {
        const notes = transaction.table<NoteDocument, string>("notes")
        for (const note of await notes.toArray()) {
          await notes.put({
            ...note,
            markdown: typeof note.markdown === "string" ? note.markdown : note.plainText,
            revision: typeof note.revision === "number" ? note.revision : 0,
          })
        }
      })

    this.version(7)
      .stores({
        planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
        planTaskGroups: "id, startDate, endDate, updatedAt",
        rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
        learningPeriods: "id, kind, startDate, endDate, updatedAt",
        legacyPlanTasks: "id, scope, periodKey, updatedAt",
        knowledgeNodes: "id, parentId, type, order, deletedAt, trashRootId, updatedAt",
        notes: "id, nodeId, title, updatedAt",
        appMeta: "key, updatedAt",
      })
      .upgrade(async (transaction) => {
        const nodeTable = transaction.table<LegacyKnowledgeNode, string>("knowledgeNodes")
        const documentTable = transaction.table<NoteDocument, string>("notes")
        const migrated = migrateLegacyKnowledgeTree(await nodeTable.toArray(), await documentTable.toArray())
        await nodeTable.clear()
        await documentTable.clear()
        await nodeTable.bulkAdd(migrated.nodes)
        await documentTable.bulkAdd(migrated.documents)
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
