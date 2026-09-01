import { describe, expect, it } from "vitest"

import { VeloDB } from "@/db/velo-db"

import {
  applyTaskGroupSchedule,
  createPlanTaskGroup,
  deletePlanTaskGroup,
  updatePlanTaskGroup,
  type CreatePlanTaskGroupInput,
} from "./plan-task-group-service"

function validInput(): CreatePlanTaskGroupInput {
  return {
    title: "完成高数第三章",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    sessionCount: 3,
    steps: [{ scheduledDate: "2026-09-01", stepIndex: 1, stepTitleMode: "inherit", title: "完成高数第三章" }],
  }
}

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-task-group-retired-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

describe("plan task group service", () => {
  it("rejects every retired mutation without writing task groups or tasks", async () => {
    await withDatabase(async (db) => {
      const operations = [
        () => createPlanTaskGroup(db, validInput(), 100),
        () => updatePlanTaskGroup(db, "group", validInput(), 100),
        () => applyTaskGroupSchedule(db, "group", [], 100),
        () => deletePlanTaskGroup(db, "group"),
      ]

      for (const operation of operations) {
        await expect(operation()).rejects.toThrow("跨日任务已停用")
        expect(await db.planTaskGroups.count()).toBe(0)
        expect(await db.planTasks.count()).toBe(0)
      }
    })
  })
})
