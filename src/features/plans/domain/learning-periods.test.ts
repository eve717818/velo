import { describe, expect, it } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"

import { countTasksInPeriod, findPeriodForDate, validateLearningPeriod } from "./learning-periods"

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "period",
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
    id: "task",
    title: "高等数学复习",
    scheduledDate: "2026-10-12",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("learning period domain rules", () => {
  it("returns the inclusive matching period for a date", () => {
    const semester = period()
    const winterBreak = period({
      id: "winter",
      kind: "winter-break",
      name: "2027 寒假",
      startDate: "2027-01-17",
      endDate: "2027-02-21",
    })

    expect(findPeriodForDate([semester, winterBreak], "2026-09-01")?.id).toBe("period")
    expect(findPeriodForDate([semester, winterBreak], "2027-01-16")?.id).toBe("period")
    expect(findPeriodForDate([semester, winterBreak], "2027-02-01")?.id).toBe("winter")
    expect(findPeriodForDate([semester, winterBreak], "2027-02-21")?.id).toBe("winter")
    expect(findPeriodForDate([semester, winterBreak], "2027-02-22")).toBeUndefined()
  })

  it("accepts semester, winter, summer, and custom break periods when they do not overlap", () => {
    const semester = period()
    const winterBreak = period({
      id: "winter",
      kind: "winter-break",
      name: "2027 寒假",
      startDate: "2027-01-17",
      endDate: "2027-02-21",
    })
    const summerBreak = period({
      id: "summer",
      kind: "summer-break",
      name: "2027 暑假",
      startDate: "2027-07-01",
      endDate: "2027-08-31",
    })
    const customBreak = period({
      id: "custom",
      kind: "custom-break",
      name: "2027 考试周缓冲",
      startDate: "2027-06-20",
      endDate: "2027-06-25",
    })

    expect(validateLearningPeriod(semester, [])).toEqual({ ok: true })
    expect(validateLearningPeriod(winterBreak, [semester])).toEqual({ ok: true })
    expect(validateLearningPeriod(customBreak, [semester, winterBreak])).toEqual({ ok: true })
    expect(validateLearningPeriod(summerBreak, [semester, winterBreak, customBreak])).toEqual({ ok: true })
  })

  it("rejects blank names, invalid dates, reversed ranges, and inclusive overlaps", () => {
    const winterBreak = period({
      id: "winter",
      kind: "winter-break",
      startDate: "2027-01-17",
      endDate: "2027-02-21",
    })

    expect(validateLearningPeriod(period({ name: "   " }), [])).toMatchObject({
      ok: false,
      field: "name",
    })
    expect(validateLearningPeriod(period({ startDate: "2027-02-30" }), [])).toMatchObject({
      ok: false,
      field: "startDate",
    })
    expect(validateLearningPeriod(period({ startDate: "2027-03-01", endDate: "2027-02-01" }), [])).toMatchObject({
      ok: false,
      field: "endDate",
    })
    expect(
      validateLearningPeriod(
        period({ id: "overlap", startDate: "2027-01-10", endDate: "2027-01-20" }),
        [winterBreak],
      ),
    ).toMatchObject({ ok: false, field: "startDate" })
    expect(
      validateLearningPeriod(
        period({ id: "touching", startDate: "2027-02-21", endDate: "2027-03-01" }),
        [winterBreak],
      ),
    ).toMatchObject({ ok: false, field: "startDate" })
  })

  it("ignores the same period id while validating edits", () => {
    const existing = period()

    expect(
      validateLearningPeriod(
        period({
          id: existing.id,
          name: "2026 秋季学期（调整）",
          startDate: "2026-09-08",
          endDate: "2027-01-23",
        }),
        [existing],
      ),
    ).toEqual({ ok: true })
  })

  it("counts tasks scheduled within an inclusive period range", () => {
    expect(
      countTasksInPeriod(
        [
          task({ id: "before", scheduledDate: "2026-08-31" }),
          task({ id: "start", scheduledDate: "2026-09-01" }),
          task({ id: "middle", scheduledDate: "2026-11-10" }),
          task({ id: "end", scheduledDate: "2027-01-16" }),
          task({ id: "after", scheduledDate: "2027-01-17" }),
        ],
        period(),
      ),
    ).toBe(3)
  })
})
