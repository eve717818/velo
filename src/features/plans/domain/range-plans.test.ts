import { describe, expect, it } from "vitest"

import {
  getRangePlanBounds,
  getRangePlanId,
  normalizeRangePlanInput,
  validateRangePlanInput,
} from "./range-plans"

describe("range plans", () => {
  it("uses Monday through Sunday across a year boundary", () => {
    expect(getRangePlanBounds("week", "2027-01-01")).toEqual({
      rangeStart: "2026-12-28",
      rangeEnd: "2027-01-03",
    })
    expect(getRangePlanId("week", "2027-01-01")).toBe("week:2026-12-28")
  })

  it("uses the full leap-year month", () => {
    expect(getRangePlanBounds("month", "2028-02-14")).toEqual({
      rangeStart: "2028-02-01",
      rangeEnd: "2028-02-29",
    })
    expect(getRangePlanId("month", "2028-02-14")).toBe("month:2028-02")
  })

  it("normalizes range-plan copy", () => {
    expect(normalizeRangePlanInput({
      theme: "  冲刺线代  ",
      goal: " 完成复习 ",
      focusItems: [" 矩阵 ", ""],
      note: " 复盘 ",
    })).toEqual({
      theme: "冲刺线代",
      goal: "完成复习",
      focusItems: ["矩阵"],
      note: "复盘",
    })
  })

  it("rejects blank required copy and more than five focus items", () => {
    expect(validateRangePlanInput({ theme: " ", goal: "目标", focusItems: [] })).toEqual({
      ok: false,
      field: "theme",
      message: "请输入计划主题",
    })
    expect(validateRangePlanInput({ theme: "主题", goal: " ", focusItems: [] })).toEqual({
      ok: false,
      field: "goal",
      message: "请输入总体目标",
    })
    expect(validateRangePlanInput({
      theme: "主题",
      goal: "目标",
      focusItems: ["1", "2", "3", "4", "5", "6"],
    })).toEqual({
      ok: false,
      field: "focusItems",
      message: "重点事项最多 5 条",
    })
  })
})
