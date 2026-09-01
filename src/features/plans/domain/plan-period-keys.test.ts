import { describe, expect, it } from "vitest"
import {
  assertValidPlanPeriodKey,
  formatPlanPeriodLabel,
  getPlanPeriodKey,
  shiftPlanPeriod,
} from "./plan-period-keys"

describe("plan period keys", () => {
  it("normalizes every independent task scope", () => {
    expect(getPlanPeriodKey("day", "2026-09-01")).toBe("2026-09-01")
    expect(getPlanPeriodKey("week", "2026-09-03")).toBe("2026-08-31")
    expect(getPlanPeriodKey("month", "2026-09-03")).toBe("2026-09")
    expect(getPlanPeriodKey("semester", "2026-09-03", "fall-2026")).toBe("fall-2026")
    expect(getPlanPeriodKey("semester", "2026-09-03")).toBeNull()
  })

  it("shifts calendar-backed scopes across year boundaries", () => {
    expect(shiftPlanPeriod("day", "2026-12-31", 1)).toBe("2027-01-01")
    expect(shiftPlanPeriod("week", "2026-12-31", 1)).toBe("2027-01-07")
    expect(shiftPlanPeriod("month", "2026-12-15", 1)).toBe("2027-01-15")
  })

  it("validates leap days, Monday week keys, and malformed months", () => {
    expect(() => assertValidPlanPeriodKey("day", "2028-02-29")).not.toThrow()
    expect(() => assertValidPlanPeriodKey("day", "2027-02-29")).toThrow("日计划周期无效")
    expect(() => assertValidPlanPeriodKey("week", "2026-09-01")).toThrow("周计划周期无效")
    expect(() => assertValidPlanPeriodKey("month", "2026-13")).toThrow("月计划周期无效")
  })

  it("formats visible labels", () => {
    expect(formatPlanPeriodLabel("week", "2026-09-01")).toBe("8月31日—9月6日")
    expect(formatPlanPeriodLabel("month", "2026-09-01")).toBe("2026年9月")
  })
})
