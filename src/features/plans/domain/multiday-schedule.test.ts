import { describe, expect, it } from "vitest"
import type { PlanTask, PlanTaskGroup } from "../../../db/types"
import { buildMultiDaySchedule, buildOverdueRescheduleProposal } from "./multiday-schedule"

function task(id: string, scheduledDate: string, estimatedMinutes?: number): PlanTask {
  return {
    id,
    title: id,
    scheduledDate,
    estimatedMinutes,
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

const group: PlanTaskGroup = {
  id: "group",
  title: "高等数学阶段复习",
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  sessionCount: 3,
  estimatedMinutes: 60,
  createdAt: 1,
  updatedAt: 1,
}

describe("buildMultiDaySchedule", () => {
  it("spreads three sessions and anchors the deadline", () => {
    expect(
      buildMultiDaySchedule(
        { startDate: "2026-09-01", endDate: "2026-09-07", sessionCount: 3 },
        [],
      ),
    ).toEqual([
      { scheduledDate: "2026-09-01", stepIndex: 1 },
      { scheduledDate: "2026-09-04", stepIndex: 2 },
      { scheduledDate: "2026-09-07", stepIndex: 3 },
    ])
  })

  it("chooses the lighter date inside an even scheduling window", () => {
    const busy = [task("busy-1", "2026-09-04", 120), task("busy-2", "2026-09-04", 60)]
    const result = buildMultiDaySchedule(
      { startDate: "2026-09-01", endDate: "2026-09-07", sessionCount: 3 },
      busy,
    )

    expect(result.map((step) => step.scheduledDate)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-07",
    ])
  })

  it.each([
    [{ startDate: "2026-09-01", endDate: "2026-09-07", sessionCount: 1 }, ["2026-09-07"]],
    [
      { startDate: "2028-02-28", endDate: "2028-03-01", sessionCount: 3 },
      ["2028-02-28", "2028-02-29", "2028-03-01"],
    ],
    [
      { startDate: "2026-12-31", endDate: "2027-01-02", sessionCount: 3 },
      ["2026-12-31", "2027-01-01", "2027-01-02"],
    ],
  ])("schedules inclusive local-date boundaries", (request, dates) => {
    expect(buildMultiDaySchedule(request, []).map(({ scheduledDate }) => scheduledDate)).toEqual(dates)
  })

  it.each([
    { startDate: "2026-09-07", endDate: "2026-09-01", sessionCount: 1 },
    { startDate: "2026-09-01", endDate: "2026-09-02", sessionCount: 3 },
    { startDate: "2026-02-31", endDate: "2026-03-02", sessionCount: 1 },
  ])("rejects invalid schedule request %#", (request) => {
    expect(() => buildMultiDaySchedule(request, [])).toThrow()
  })
})

describe("buildOverdueRescheduleProposal", () => {
  it("keeps completed steps fixed and moves overdue work to the lightest free date", () => {
    const completed = {
      ...task("completed", "2026-09-01", 60),
      groupId: group.id,
      stepIndex: 1,
      isCompleted: 1 as const,
    }
    const overdue = {
      ...task("overdue", "2026-09-02", 60),
      groupId: group.id,
      stepIndex: 2,
    }
    const future = {
      ...task("future", "2026-09-07", 60),
      groupId: group.id,
      stepIndex: 3,
    }
    const otherTasks = [task("busy", "2026-09-05", 180)]

    expect(
      buildOverdueRescheduleProposal(group, [completed, overdue, future], otherTasks, "2026-09-04"),
    ).toEqual([
      { taskId: "overdue", previousDate: "2026-09-02", scheduledDate: "2026-09-04" },
    ])
  })

  it("rejects rescheduling when every remaining date is occupied by another group step", () => {
    const shortGroup = { ...group, endDate: "2026-09-05", sessionCount: 3 }
    const overdue = { ...task("overdue", "2026-09-01"), groupId: group.id, stepIndex: 1 }
    const fixedToday = { ...task("today", "2026-09-04"), groupId: group.id, stepIndex: 2 }
    const fixedDeadline = { ...task("deadline", "2026-09-05"), groupId: group.id, stepIndex: 3 }

    expect(() =>
      buildOverdueRescheduleProposal(
        shortGroup,
        [overdue, fixedToday, fixedDeadline],
        [],
        "2026-09-04",
      ),
    ).toThrow("截止日前没有足够日期重新安排剩余学习")
  })
})
