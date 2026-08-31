import { describe, expect, it } from "vitest"

import type { PlanTask, PlanTaskGroup } from "@/db/types"

import { getTaskGroupProgress, getTaskGroupStepState, groupOverlapsRange } from "./task-group-status"

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: "step",
    title: "高数第三章",
    scheduledDate: "2026-08-30",
    groupId: "group",
    stepIndex: 1,
    stepTitleMode: "inherit",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<PlanTaskGroup> = {}): PlanTaskGroup {
  return {
    id: "group",
    title: "高数第三章",
    startDate: "2026-08-24",
    endDate: "2026-08-30",
    sessionCount: 2,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("task group status", () => {
  it("does not count the parent group or ordinary tasks in group progress", () => {
    const tasks = [
      makeTask({ id: "one", stepIndex: 1, isCompleted: 1 }),
      makeTask({ id: "two", stepIndex: 2, isCompleted: 0 }),
      makeTask({ id: "ordinary", groupId: undefined, stepIndex: undefined }),
    ]

    expect(getTaskGroupProgress("group", tasks)).toEqual({
      completed: 1,
      total: 2,
      ratio: 1 / 2,
    })
  })

  it("derives completed, overdue, current, and upcoming step states", () => {
    expect(getTaskGroupStepState(makeTask(), "2026-08-31")).toBe("needs-reschedule")
    expect(getTaskGroupStepState(makeTask({ isCompleted: 1 }), "2026-08-31")).toBe("completed")
    expect(getTaskGroupStepState(makeTask({ scheduledDate: "2026-08-31" }), "2026-08-31")).toBe("current")
    expect(getTaskGroupStepState(makeTask({ scheduledDate: "2026-09-01" }), "2026-08-31")).toBe("upcoming")
  })

  it.each([
    [makeGroup({ startDate: "2026-08-20", endDate: "2026-08-24" }), true],
    [makeGroup({ startDate: "2026-08-30", endDate: "2026-09-02" }), true],
    [makeGroup({ startDate: "2026-08-25", endDate: "2026-08-28" }), true],
    [makeGroup({ startDate: "2026-08-01", endDate: "2026-08-23" }), false],
    [makeGroup({ startDate: "2026-08-31", endDate: "2026-09-02" }), false],
  ])("checks inclusive interval overlap %#", (group, expected) => {
    expect(groupOverlapsRange(group, "2026-08-24", "2026-08-30")).toBe(expected)
  })
})
