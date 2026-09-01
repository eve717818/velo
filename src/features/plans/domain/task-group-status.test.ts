import { describe, expect, it } from "vitest"

import { getTaskGroupProgress, getTaskGroupStepState, groupOverlapsRange } from "./task-group-status"

describe("retired task-group status", () => {
  it("does not derive state for a retired task group", () => {
    expect(() => getTaskGroupProgress("group", [])).toThrow("跨日任务已停用")
    expect(() => getTaskGroupStepState({} as never, "2026-09-01")).toThrow("跨日任务已停用")
    expect(() => groupOverlapsRange({} as never, "2026-09-01", "2026-09-07")).toThrow("跨日任务已停用")
  })
})
