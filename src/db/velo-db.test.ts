import { describe, expect, it } from "vitest"
import type { NoteDocument, PlanTask } from "./types"
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
  scope: "week",
  periodKey: "2026-W34",
  title: "已有计划",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
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
  it("seeds the deterministic home demo into a fresh database", async () => {
    await withDatabase(async (db) => {
      await seedHomeDemo(db, seedDate)

      expect(await db.planTasks.where("periodKey").equals("2026-08-25").count()).toBe(5)
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
})
