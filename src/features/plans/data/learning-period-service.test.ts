import { describe, expect, it } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import {
  createLearningPeriod,
  deleteLearningPeriod,
  updateLearningPeriod,
} from "./learning-period-service"

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-period-test-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "semester",
    kind: "semester",
    name: "2026 秋季学期",
    startDate: "2026-09-01",
    endDate: "2027-01-16",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "任务",
    scheduledDate: "2026-10-01",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("learning period service", () => {
  it("creates a trimmed learning period inside the database", async () => {
    await withDatabase(async (db) => {
      const created = await createLearningPeriod(
        db,
        {
          kind: "semester",
          name: " 2026 秋季学期 ",
          startDate: "2026-09-01",
          endDate: "2027-01-16",
          goal: "  完成高数与线代基础  ",
        },
        100,
      )

      expect(created).toMatchObject({
        kind: "semester",
        name: "2026 秋季学期",
        goal: "完成高数与线代基础",
        createdAt: 100,
        updatedAt: 100,
      })
      expect(await db.learningPeriods.get(created.id)).toEqual(created)
    })
  })

  it("rechecks overlap inside the write transaction for creates", async () => {
    await withDatabase(async (db) => {
      await db.learningPeriods.add(period())

      await expect(
        createLearningPeriod(
          db,
          {
            kind: "winter-break",
            name: "2027 寒假",
            startDate: "2027-01-16",
            endDate: "2027-02-20",
          },
          200,
        ),
      ).rejects.toThrow("Learning period overlaps an existing period")

      expect(await db.learningPeriods.count()).toBe(1)
    })
  })

  it("updates an existing period and preserves its created timestamp", async () => {
    await withDatabase(async (db) => {
      await db.learningPeriods.add(period())

      const updated = await updateLearningPeriod(
        db,
        "semester",
        {
          kind: "semester",
          name: " 2026 秋季学期（调整） ",
          startDate: "2026-09-08",
          endDate: "2027-01-23",
          goal: "  完成秋季学期主线目标 ",
        },
        300,
      )

      expect(updated).toMatchObject({
        id: "semester",
        name: "2026 秋季学期（调整）",
        startDate: "2026-09-08",
        endDate: "2027-01-23",
        goal: "完成秋季学期主线目标",
        createdAt: 1,
        updatedAt: 300,
      })
      expect(await db.learningPeriods.get("semester")).toEqual(updated)
    })
  })

  it("rechecks overlap inside the write transaction for updates", async () => {
    await withDatabase(async (db) => {
      await db.learningPeriods.bulkAdd([
        period(),
        period({
          id: "winter",
          kind: "winter-break",
          name: "2027 寒假",
          startDate: "2027-01-17",
          endDate: "2027-02-21",
        }),
      ])

      await expect(
        updateLearningPeriod(
          db,
          "winter",
          {
            kind: "winter-break",
            name: "2027 寒假",
            startDate: "2027-01-16",
            endDate: "2027-02-21",
          },
          400,
        ),
      ).rejects.toThrow("Learning period overlaps an existing period")

      expect(await db.learningPeriods.get("winter")).toMatchObject({
        startDate: "2027-01-17",
        endDate: "2027-02-21",
        updatedAt: 1,
      })
    })
  })

  it("deletes a period and reports how many tasks become unassigned", async () => {
    await withDatabase(async (db) => {
      await db.learningPeriods.add(period())
      await db.planTasks.bulkAdd([
        task({ id: "before", scheduledDate: "2026-08-31" }),
        task({ id: "start", scheduledDate: "2026-09-01" }),
        task({ id: "middle", scheduledDate: "2026-11-10" }),
        task({ id: "end", scheduledDate: "2027-01-16" }),
        task({ id: "after", scheduledDate: "2027-01-17" }),
      ])

      await expect(deleteLearningPeriod(db, "semester")).resolves.toEqual({ affectedTaskCount: 3 })
      expect(await db.learningPeriods.get("semester")).toBeUndefined()
      expect(await db.planTasks.count()).toBe(5)
    })
  })
})
