import { describe, expect, it } from "vitest"

import { buildMultiDaySchedule, buildOverdueRescheduleProposal } from "./multiday-schedule"

describe("retired multi-day scheduling", () => {
  it("does not produce a cross-day schedule", () => {
    expect(() => buildMultiDaySchedule({ endDate: "2026-09-07", sessionCount: 3, startDate: "2026-09-01" }, [])).toThrow("跨日任务已停用")
  })

  it("does not propose cross-day rescheduling", () => {
    expect(() => buildOverdueRescheduleProposal({} as never, [], [], "2026-09-04")).toThrow("跨日任务已停用")
  })
})
