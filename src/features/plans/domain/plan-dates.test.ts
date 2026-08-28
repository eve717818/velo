import { describe, expect, it } from "vitest"

import {
  addLocalDays,
  clampDateToRange,
  getMonthGridDates,
  getMonthRange,
  getProgress,
  getWeekDates,
  isOverdue,
  parseLocalDate,
} from "./plan-dates"

describe("plan date rules", () => {
  it("parses date-only strings at local noon", () => {
    const parsed = parseLocalDate("2026-08-28")

    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(28)
    expect(parsed.getHours()).toBe(12)
  })

  it("rejects invalid local date strings", () => {
    expect(() => parseLocalDate("2026/08/28")).toThrowError("Invalid local date")
  })

  it("rejects calendar-invalid local dates", () => {
    expect(() => parseLocalDate("2026-02-31")).toThrowError("Invalid local date")
    expect(() => parseLocalDate("2026-13-01")).toThrowError("Invalid local date")
    expect(() => parseLocalDate("2026-00-10")).toThrowError("Invalid local date")
  })

  it("adds local days across month boundaries", () => {
    expect(addLocalDays("2026-08-31", 1)).toBe("2026-09-01")
  })

  it("returns Monday-through-Sunday week dates across a year boundary", () => {
    expect(getWeekDates("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ])
  })

  it("returns the full leap-year month range", () => {
    expect(getMonthRange("2028-02-10")).toEqual({
      startDate: "2028-02-01",
      endDate: "2028-02-29",
    })
  })

  it("returns complete Monday-through-Sunday weeks covering the visible month", () => {
    expect(getMonthGridDates("2026-08-10")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ])
  })

  it("returns zero progress for an empty task list", () => {
    expect(getProgress([])).toEqual({ completed: 0, total: 0, ratio: 0 })
  })

  it("counts completed tasks using the PlanTask completion flag", () => {
    expect(
      getProgress([
        { isCompleted: 1 },
        { isCompleted: 0 },
        { isCompleted: 1 },
      ]),
    ).toEqual({ completed: 2, total: 3, ratio: 2 / 3 })
  })

  it("marks incomplete past tasks overdue and completed tasks not overdue", () => {
    expect(isOverdue({ scheduledDate: "2026-08-27", isCompleted: 0 }, "2026-08-28")).toBe(true)
    expect(isOverdue({ scheduledDate: "2026-08-27", isCompleted: 1 }, "2026-08-28")).toBe(false)
  })

  it("does not mark tasks due today as overdue", () => {
    expect(isOverdue({ scheduledDate: "2026-08-28", isCompleted: 0 }, "2026-08-28")).toBe(false)
  })

  it("clamps dates below the range to the range start", () => {
    expect(clampDateToRange("2026-08-28", "2026-09-01", "2027-01-16")).toBe("2026-09-01")
  })

  it("returns in-range dates unchanged and caps dates above the range end", () => {
    expect(clampDateToRange("2026-10-01", "2026-09-01", "2027-01-16")).toBe("2026-10-01")
    expect(clampDateToRange("2027-02-01", "2026-09-01", "2027-01-16")).toBe("2027-01-16")
  })
})
