import { describe, expect, it } from "vitest"

import { VeloDB } from "@/db/velo-db"
import type { RangePlanInput } from "../domain/range-plans"

import { RangePlanValidationError, getRangePlan, saveRangePlan } from "./range-plan-service"

function createDatabase() {
  return new VeloDB(`velo-range-plan-${crypto.randomUUID()}`)
}

describe("range plan service", () => {
  it("upserts one record for the same natural week", async () => {
    const db = createDatabase()

    try {
      const first = await saveRangePlan(db, "week", "2026-09-01", {
        theme: "线代复习",
        goal: "完成矩阵章节",
        focusItems: ["矩阵乘法"],
        note: "晚间复盘",
      }, 10)
      const second = await saveRangePlan(db, "week", "2026-09-06", {
        theme: "线代冲刺",
        goal: "完成错题",
        focusItems: ["秩"],
        note: "",
      }, 20)

      expect(second).toMatchObject({
        id: first.id,
        createdAt: 10,
        updatedAt: 20,
        rangeStart: "2026-08-31",
        rangeEnd: "2026-09-06",
        theme: "线代冲刺",
        note: undefined,
      })
      expect(await db.rangePlans.count()).toBe(1)
      expect(await getRangePlan(db, "week", "2026-09-03")).toEqual(second)
    } finally {
      await db.delete()
    }
  })

  it.each<[RangePlanInput, keyof RangePlanInput]>([
    [{ theme: " ", goal: "目标", focusItems: [] }, "theme"],
    [{ theme: "主题", goal: " ", focusItems: [] }, "goal"],
    [{ theme: "主题", goal: "目标", focusItems: ["1", "2", "3", "4", "5", "6"] }, "focusItems"],
  ])("rejects invalid input at %s", async (input, field) => {
    const db = createDatabase()

    try {
      await expect(saveRangePlan(db, "month", "2026-09-01", input, 10)).rejects.toMatchObject({
        name: "RangePlanValidationError",
        field,
      } satisfies Partial<RangePlanValidationError>)
      expect(await db.rangePlans.count()).toBe(0)
    } finally {
      await db.delete()
    }
  })
})
