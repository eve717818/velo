import type { RangePlanKind } from "@/db/types"

import { getMonthRange, getWeekDates } from "./plan-dates"

export interface RangePlanInput {
  theme: string
  goal: string
  focusItems: string[]
  note?: string
}

export type RangePlanValidation =
  | { ok: true }
  | { ok: false; field: keyof RangePlanInput; message: string }

export function getRangePlanBounds(
  kind: RangePlanKind,
  selectedDate: string,
): { rangeStart: string; rangeEnd: string } {
  if (kind === "week") {
    const dates = getWeekDates(selectedDate)
    return { rangeStart: dates[0], rangeEnd: dates[dates.length - 1] }
  }

  const { startDate, endDate } = getMonthRange(selectedDate)
  return { rangeStart: startDate, rangeEnd: endDate }
}

export function getRangePlanId(kind: RangePlanKind, selectedDate: string): string {
  const { rangeStart } = getRangePlanBounds(kind, selectedDate)
  return kind === "week" ? `week:${rangeStart}` : `month:${rangeStart.slice(0, 7)}`
}

export function normalizeRangePlanInput(input: RangePlanInput): RangePlanInput {
  return {
    theme: input.theme.trim(),
    goal: input.goal.trim(),
    focusItems: input.focusItems.map((item) => item.trim()).filter(Boolean),
    note: input.note?.trim() || undefined,
  }
}

export function validateRangePlanInput(input: RangePlanInput): RangePlanValidation {
  if (!input.theme.trim()) {
    return { ok: false, field: "theme", message: "请输入计划主题" }
  }

  if (!input.goal.trim()) {
    return { ok: false, field: "goal", message: "请输入总体目标" }
  }

  if (input.focusItems.filter((item) => item.trim()).length > 5) {
    return { ok: false, field: "focusItems", message: "重点事项最多 5 条" }
  }

  return { ok: true }
}
