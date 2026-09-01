import { describe, expect, it } from "vitest"

import type { LegacyPlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { convertLegacyPlanTask } from "./legacy-plan-task-service"

const legacy: LegacyPlanTask = {
  id: "legacy-transaction",
  scope: "week",
  periodKey: "2027-W03",
  title: "旧周计划",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

describe("convertLegacyPlanTask", () => {
  it("creates only a day task at the chosen date with day-scoped ordering", async () => {
    const db = new VeloDB(`legacy-day-${crypto.randomUUID()}`)
    await db.legacyPlanTasks.add(legacy)
    await db.planTasks.bulkAdd([
      {
        id: "existing-day",
        title: "已有日任务",
        scope: "day",
        periodKey: "2027-02-20",
        isCompleted: 0,
        order: 2,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "same-key-week",
        title: "同键周任务",
        scope: "week",
        periodKey: "2027-02-20",
        isCompleted: 0,
        order: 8,
        createdAt: 1,
        updatedAt: 1,
      },
    ])

    try {
      const created = await convertLegacyPlanTask(db, legacy.id, "2027-02-20", 10)

      expect(created).toMatchObject({
        title: legacy.title,
        scope: "day",
        periodKey: "2027-02-20",
        isCompleted: 0,
        order: 3,
      })
      expect(created.startMinutes).toBeUndefined()
      expect(await db.legacyPlanTasks.get(legacy.id)).toBeUndefined()
    } finally {
      await db.delete()
    }
  })

  it("rolls back the new v2 task when deleting the legacy row fails", async () => {
    const db = new VeloDB(`legacy-transaction-${crypto.randomUUID()}`)
    await db.legacyPlanTasks.add(legacy)
    db.legacyPlanTasks.hook("deleting", () => { throw new Error("forced legacy delete failure") })

    try {
      await expect(convertLegacyPlanTask(db, legacy.id, "2027-02-20", 10)).rejects.toThrow("forced legacy delete failure")
      expect(await db.planTasks.toArray()).toEqual([])
      expect(await db.legacyPlanTasks.get(legacy.id)).toEqual(legacy)
    } finally {
      await db.delete()
    }
  })
})
