import Dexie from "dexie"
import { describe, expect, it } from "vitest"
import type { LegacyPlanTask, NoteDocument, PlanTask, PlanTaskGroup } from "./types"
import { seedHomeDemo } from "./seed"
import { VeloDB } from "./velo-db"

const seedDate = new Date(2026, 7, 25, 9, 0)

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-test-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

const existingTask: PlanTask = {
  id: "existing-task",
  scheduledDate: "2026-08-25",
  title: "已有计划",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

function legacyTask(overrides: Partial<LegacyPlanTask> & Pick<LegacyPlanTask, "id" | "scope" | "periodKey">): LegacyPlanTask {
  return {
    title: "旧计划",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

async function createVersionOneDatabase(name: string, tasks: LegacyPlanTask[]) {
  const oldDb = new Dexie(name)
  oldDb.version(1).stores({
    planTasks: "id, [scope+periodKey], periodKey, isCompleted, order, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("planTasks").bulkAdd(tasks)
  oldDb.close()
}

async function createVersionTwoDatabase(name: string, tasks: PlanTask[]) {
  const oldDb = new Dexie(name)
  oldDb.version(2).stores({
    planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], isCompleted, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("planTasks").bulkAdd(tasks)
  oldDb.close()
}

const existingNote: NoteDocument = {
  id: "existing-note",
  nodeId: "existing-node",
  title: "已有笔记",
  content: { type: "doc" },
  plainText: "已有内容",
  createdAt: 1,
  updatedAt: 1,
}

describe("VeloDB and seedHomeDemo", () => {
  it("provides a range-plan table indexed by range and update time", async () => {
    await withDatabase(async (db) => {
      await db.open()

      expect(db.rangePlans.schema.primKey.keyPath).toBe("id")
      expect(db.rangePlans.schema.indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining(["kind", "rangeStart", "rangeEnd", "updatedAt"]),
      )
    })
  })

  it("seeds the deterministic home demo into a fresh database", async () => {
    await withDatabase(async (db) => {
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.where("scheduledDate").equals("2026-08-25").count()).toBe(5)
      expect(await db.planTasks.where("isCompleted").equals(1).count()).toBe(3)
      expect(await db.notes.orderBy("updatedAt").last()).toMatchObject({ title: "线性代数：矩阵的秩" })
      expect(await db.appMeta.get("homeDemoSeed")).toMatchObject({ key: "homeDemoSeed", value: "v1:applied" })
    })
  })

  it("does not duplicate the demo after an applied seed marker", async () => {
    await withDatabase(async (db) => {
      await seedHomeDemo(db, seedDate)
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.count()).toBe(5)
      expect(await db.knowledgeNodes.count()).toBe(1)
      expect(await db.notes.count()).toBe(1)
      expect(await db.appMeta.get("homeDemoSeed")).toMatchObject({ value: "v1:applied" })
    })
  })

  it("preserves task-only data and records a skipped seed", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.add(existingTask)
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.toArray()).toEqual([existingTask])
      expect(await db.notes.count()).toBe(0)
      expect(await db.knowledgeNodes.count()).toBe(0)
      expect(await db.appMeta.get("homeDemoSeed")).toMatchObject({ value: "v1:skipped-existing-data" })
    })
  })

  it("preserves note-only data and records a skipped seed", async () => {
    await withDatabase(async (db) => {
      await db.notes.add(existingNote)
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.count()).toBe(0)
      expect(await db.knowledgeNodes.count()).toBe(0)
      expect(await db.notes.toArray()).toEqual([existingNote])
      expect(await db.appMeta.get("homeDemoSeed")).toMatchObject({ value: "v1:skipped-existing-data" })
    })
  })

  it("preserves mixed task and note data and records a skipped seed", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.add(existingTask)
      await db.notes.add(existingNote)
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.toArray()).toEqual([existingTask])
      expect(await db.knowledgeNodes.count()).toBe(0)
      expect(await db.notes.toArray()).toEqual([existingNote])
      expect(await db.appMeta.get("homeDemoSeed")).toMatchObject({ value: "v1:skipped-existing-data" })
    })
  })

  it("upgrades dated day tasks and quarantines ambiguous legacy tasks", async () => {
    const name = `velo-upgrade-${crypto.randomUUID()}`
    await createVersionOneDatabase(name, [
      legacyTask({ id: "day", scope: "day", periodKey: "2026-08-28" }),
      legacyTask({ id: "week", scope: "week", periodKey: "2026-W35" }),
      legacyTask({ id: "malformed-day", scope: "day", periodKey: "2026-02-31" }),
    ])

    const db = new VeloDB(name)
    await db.open()
    expect(await db.planTasks.get("day")).toMatchObject({ scheduledDate: "2026-08-28", isCompleted: 0 })
    expect(await db.planTasks.get("week")).toBeUndefined()
    expect(await db.planTasks.get("malformed-day")).toBeUndefined()
    expect(await db.legacyPlanTasks.get("week")).toMatchObject({ scope: "week", periodKey: "2026-W35" })
    expect(await db.legacyPlanTasks.get("malformed-day")).toMatchObject({ scope: "day", periodKey: "2026-02-31" })
    await db.delete()
  })

  it("upgrades version two data without changing existing tasks", async () => {
    const name = `velo-v2-upgrade-${crypto.randomUUID()}`
    await createVersionTwoDatabase(name, [existingTask])

    const db = new VeloDB(name)
    await db.open()

    expect(await db.planTasks.toArray()).toEqual([existingTask])
    expect(await db.planTaskGroups.count()).toBe(0)
    await db.delete()
  })

  it("indexes task groups and their ordered child steps", async () => {
    await withDatabase(async (db) => {
      const group: PlanTaskGroup = {
        id: "calculus-review",
        title: "高等数学阶段复习",
        startDate: "2026-08-31",
        endDate: "2026-09-06",
        sessionCount: 2,
        createdAt: 1,
        updatedAt: 1,
      }
      await db.planTaskGroups.add(group)
      await db.planTasks.bulkAdd([
        { ...existingTask, id: "step-2", groupId: group.id, stepIndex: 2, scheduledDate: "2026-09-06" },
        { ...existingTask, id: "step-1", groupId: group.id, stepIndex: 1, scheduledDate: "2026-08-31" },
      ])

      expect(await db.planTaskGroups.where("startDate").equals("2026-08-31").toArray()).toEqual([group])
      expect(await db.planTasks.where("groupId").equals(group.id).count()).toBe(2)
      expect(await db.planTasks.where("[groupId+stepIndex]").between([group.id, Dexie.minKey], [group.id, Dexie.maxKey]).toArray()).toMatchObject([
        { id: "step-1", stepIndex: 1 },
        { id: "step-2", stepIndex: 2 },
      ])
    })
  })
})
