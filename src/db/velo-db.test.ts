import Dexie from "dexie"
import { describe, expect, it } from "vitest"
import type { LegacyKnowledgeNode, LegacyPlanTask, NoteDocument, PlanTask, PlanTaskGroup } from "./types"
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
  scope: "day",
  periodKey: "2026-08-25",
  title: "已有计划",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

type VersionFourPlanTask = {
  id: string
  title: string
  scheduledDate: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
  isCompleted: 0 | 1
  completedAt?: number
  groupId?: string
  stepIndex?: number
  stepTitleMode?: "inherit" | "custom"
  order: number
  createdAt: number
  updatedAt: number
}

const existingVersionFourTask: VersionFourPlanTask = {
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

async function createVersionTwoDatabase(name: string, tasks: VersionFourPlanTask[]) {
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

async function createVersionFourDatabase(name: string, tasks: VersionFourPlanTask[]) {
  const oldDb = new Dexie(name)
  oldDb.version(4).stores({
    planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], groupId, [groupId+stepIndex], isCompleted, updatedAt",
    planTaskGroups: "id, startDate, endDate, updatedAt",
    rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("planTasks").bulkAdd(tasks)
  oldDb.close()
}

async function createVersionFiveNotesDatabase(name: string) {
  const oldDb = new Dexie(name)
  oldDb.version(5).stores({
    planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
    planTaskGroups: "id, startDate, endDate, updatedAt",
    rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("knowledgeNodes").add({
    id: "existing-node",
    parentId: null,
    type: "note",
    title: "旧笔记",
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  await oldDb.table("notes").add(existingNote)
  oldDb.close()
}

async function createVersionSixNotesDatabase(
  name: string,
  nodes: LegacyKnowledgeNode[] = [
    {
      id: "legacy-inbox",
      parentId: null,
      type: "note",
      title: "速记",
      order: 0,
      inbox: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "empty-parent",
      parentId: null,
      type: "note",
      title: "数学",
      order: 1,
      inbox: false,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: "empty-child",
      parentId: "empty-parent",
      type: "note",
      title: "导数",
      order: 0,
      inbox: false,
      createdAt: 3,
      updatedAt: 3,
    },
    {
      id: "written-parent",
      parentId: null,
      type: "note",
      title: "物理",
      order: 2,
      inbox: false,
      createdAt: 4,
      updatedAt: 4,
    },
    {
      id: "written-child",
      parentId: "written-parent",
      type: "note",
      title: "力学",
      order: 0,
      inbox: false,
      createdAt: 5,
      updatedAt: 5,
    },
  ],
  documents: NoteDocument[] = [
    {
      id: "legacy-inbox-document",
      nodeId: "legacy-inbox",
      title: "速记",
      content: { type: "doc" },
      plainText: "收集内容",
      markdown: "收集内容",
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "empty-parent-document",
      nodeId: "empty-parent",
      title: "数学",
      content: { type: "doc", content: [] },
      plainText: "",
      markdown: "",
      revision: 0,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: "empty-child-document",
      nodeId: "empty-child",
      title: "导数",
      content: { type: "doc" },
      plainText: "定义",
      markdown: "定义",
      revision: 0,
      createdAt: 3,
      updatedAt: 3,
    },
    {
      id: "written-parent-document",
      nodeId: "written-parent",
      title: "物理",
      content: { type: "doc" },
      plainText: "原父节点正文",
      markdown: "原父节点正文",
      revision: 0,
      createdAt: 4,
      updatedAt: 4,
    },
    {
      id: "written-child-document",
      nodeId: "written-child",
      title: "力学",
      content: { type: "doc" },
      plainText: "牛顿定律",
      markdown: "牛顿定律",
      revision: 0,
      createdAt: 5,
      updatedAt: 5,
    },
  ],
) {
  const oldDb = new Dexie(name)
  oldDb.version(6).stores({
    planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
    planTaskGroups: "id, startDate, endDate, updatedAt",
    rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, inbox, deletedAt, trashRootId, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("knowledgeNodes").bulkAdd(nodes)
  await oldDb.table("notes").bulkAdd(documents)
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
      expect(db.planTasks.schema.indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining(["[scope+periodKey]", "scope", "periodKey", "[scope+periodKey+isCompleted]", "isCompleted", "updatedAt"]),
      )
      expect(db.planTaskGroups.schema.primKey.keyPath).toBe("id")
    })
  })

  it("seeds the deterministic home demo into a fresh database", async () => {
    await withDatabase(async (db) => {
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.where("[scope+periodKey]").equals(["day", "2026-08-25"]).count()).toBe(5)
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
    expect(await db.planTasks.get("day")).toMatchObject({ scope: "day", periodKey: "2026-08-28", isCompleted: 0 })
    expect(await db.planTasks.get("week")).toBeUndefined()
    expect(await db.planTasks.get("malformed-day")).toBeUndefined()
    expect(await db.legacyPlanTasks.get("week")).toMatchObject({ scope: "week", periodKey: "2026-W35" })
    expect(await db.legacyPlanTasks.get("malformed-day")).toMatchObject({ scope: "day", periodKey: "2026-02-31" })
    await db.delete()
  })

  it("upgrades version two data into independent day tasks", async () => {
    const name = `velo-v2-upgrade-${crypto.randomUUID()}`
    await createVersionTwoDatabase(name, [existingVersionFourTask])

    const db = new VeloDB(name)
    await db.open()

    expect(await db.planTasks.toArray()).toEqual([existingTask])
    expect(await db.planTaskGroups.count()).toBe(0)
    await db.delete()
  })

  it("upgrades v4 tasks into independent day tasks", async () => {
    const name = `velo-v4-upgrade-${crypto.randomUUID()}`
    await createVersionFourDatabase(name, [
      existingVersionFourTask,
      { ...existingVersionFourTask, id: "group-step", groupId: "group", stepIndex: 2, stepTitleMode: "inherit", isCompleted: 1 },
    ])

    const db = new VeloDB(name)
    await db.open()

    expect(await db.planTasks.get("existing-task")).toMatchObject({
      scope: "day",
      periodKey: "2026-08-25",
      title: "已有计划",
    })
    expect(await db.planTasks.get("group-step")).toMatchObject({
      scope: "day",
      periodKey: "2026-08-25",
      isCompleted: 1,
    })
    expect(await db.planTasks.get("group-step")).not.toHaveProperty("groupId")
    expect(await db.planTasks.get("group-step")).not.toHaveProperty("stepIndex")
    expect(await db.planTasks.get("group-step")).not.toHaveProperty("stepTitleMode")
    expect(await db.planTaskGroups.count()).toBeGreaterThanOrEqual(0)
    await db.delete()
  })

  it("rolls back a v5 upgrade when a v4 task date is invalid", async () => {
    const name = `velo-v4-invalid-upgrade-${crypto.randomUUID()}`
    const validTask: VersionFourPlanTask = { ...existingVersionFourTask, id: "a-valid" }
    const invalidTask: VersionFourPlanTask = { ...existingVersionFourTask, id: "z-invalid", scheduledDate: "2027-02-29" }
    await createVersionFourDatabase(name, [validTask, invalidTask])

    const db = new VeloDB(name)
    await expect(db.open()).rejects.toThrow()
    db.close()

    const rawV4 = new Dexie(name)
    rawV4.version(4).stores({
      planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], groupId, [groupId+stepIndex], isCompleted, updatedAt",
      planTaskGroups: "id, startDate, endDate, updatedAt",
      rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
      learningPeriods: "id, kind, startDate, endDate, updatedAt",
      legacyPlanTasks: "id, scope, periodKey, updatedAt",
      knowledgeNodes: "id, parentId, type, order, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })
    await rawV4.open()
    const rawTasks = await rawV4.table<VersionFourPlanTask, string>("planTasks").orderBy("id").toArray()
    expect(rawTasks).toEqual([validTask, invalidTask])
    const reloadedValidTask = await rawV4.table<VersionFourPlanTask, string>("planTasks").get(validTask.id)
    expect(reloadedValidTask).toEqual(validTask)
    expect(reloadedValidTask).not.toHaveProperty("scope")
    expect(reloadedValidTask).not.toHaveProperty("periodKey")
    expect(await rawV4.table<VersionFourPlanTask, string>("planTasks").get(invalidTask.id)).toEqual(invalidTask)
    await rawV4.delete()
  })

  it("preserves the task-group table through the v5 schema", async () => {
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
      expect(await db.planTaskGroups.where("startDate").equals("2026-08-31").toArray()).toEqual([group])
    })
  })

  it("keeps legacy JSON and backfills readable Markdown when upgrading notes", async () => {
    const name = `velo-v5-notes-${crypto.randomUUID()}`
    await createVersionFiveNotesDatabase(name)

    const db = new VeloDB(name)
    await db.open()

    await expect(db.notes.get("existing-note")).resolves.toMatchObject({
      id: "existing-note",
      nodeId: "existing-node",
      content: { type: "doc" },
      plainText: "已有内容",
      markdown: "已有内容",
      revision: 0,
    })
    expect(await db.knowledgeNodes.get("existing-node")).toMatchObject({ id: "existing-node", title: "旧笔记" })
    await db.delete()
  })

  it("migrates version six note parents into folders and overview notes", async () => {
    const name = `velo-v6-notes-${crypto.randomUUID()}`
    await createVersionSixNotesDatabase(name)

    const db = new VeloDB(name)
    await db.open()

    expect(await db.knowledgeNodes.get("empty-parent")).toMatchObject({ type: "folder" })
    expect(await db.notes.where("nodeId").equals("empty-parent").count()).toBe(0)
    const overview = await db.knowledgeNodes
      .where("parentId")
      .equals("written-parent")
      .filter((item) => item.title === "概览")
      .first()
    expect(overview).toMatchObject({ type: "note", order: 0 })
    expect(await db.notes.get("written-parent-document")).toMatchObject({ nodeId: overview?.id, markdown: "原父节点正文" })
    expect(await db.knowledgeNodes.get("legacy-inbox")).not.toHaveProperty("inbox")
    await db.delete()
  })

  it("rolls back the version seven migration when a document references a missing node", async () => {
    const name = `velo-v6-orphan-${crypto.randomUUID()}`
    const legacyNode: LegacyKnowledgeNode = {
      id: "legacy-node",
      parentId: null,
      type: "note",
      title: "旧笔记",
      order: 0,
      inbox: true,
      createdAt: 1,
      updatedAt: 1,
    }
    const legacyDocument: NoteDocument = {
      id: "orphan-document",
      nodeId: "missing-node",
      title: "孤儿正文",
      content: { type: "doc" },
      plainText: "不能静默丢弃",
      markdown: "不能静默丢弃",
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
    }
    await createVersionSixNotesDatabase(name, [legacyNode], [legacyDocument])

    const db = new VeloDB(name)
    await expect(db.open()).rejects.toThrow()
    db.close()

    const rawV6 = new Dexie(name)
    rawV6.version(6).stores({
      planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
      planTaskGroups: "id, startDate, endDate, updatedAt",
      rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
      learningPeriods: "id, kind, startDate, endDate, updatedAt",
      legacyPlanTasks: "id, scope, periodKey, updatedAt",
      knowledgeNodes: "id, parentId, type, order, inbox, deletedAt, trashRootId, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })
    await rawV6.open()
    expect(await rawV6.table<LegacyKnowledgeNode, string>("knowledgeNodes").toArray()).toEqual([legacyNode])
    expect(await rawV6.table<NoteDocument, string>("notes").toArray()).toEqual([legacyDocument])
    await rawV6.delete()
  })
})
