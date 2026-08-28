import { formatLocalDate } from "../../../lib/local-date"
import type { PlanTask } from "../../../db/types"

export function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error("Invalid local date")
  }

  const [, year, month, day] = match
  const parsedYear = Number(year)
  const parsedMonth = Number(month)
  const parsedDay = Number(day)
  const date = new Date(parsedYear, parsedMonth - 1, parsedDay, 12, 0, 0, 0)

  if (
    date.getFullYear() !== parsedYear ||
    date.getMonth() !== parsedMonth - 1 ||
    date.getDate() !== parsedDay
  ) {
    throw new Error("Invalid local date")
  }

  return date
}

export function addLocalDays(value: string, days: number): string {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

export function getWeekDates(value: string): string[] {
  const date = parseLocalDate(value)
  const mondayOffset = (date.getDay() + 6) % 7
  const startDate = addLocalDays(value, -mondayOffset)

  return Array.from({ length: 7 }, (_, index) => addLocalDays(startDate, index))
}

export function getMonthRange(value: string): { startDate: string; endDate: string } {
  const date = parseLocalDate(value)
  const startDate = formatLocalDate(new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0))
  const endDate = formatLocalDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0))

  return { startDate, endDate }
}

export function getMonthGridDates(value: string): string[] {
  const { startDate, endDate } = getMonthRange(value)
  const monthStart = parseLocalDate(startDate)
  const monthEnd = parseLocalDate(endDate)
  const gridStart = addLocalDays(startDate, -((monthStart.getDay() + 6) % 7))
  const gridEnd = addLocalDays(endDate, 6 - ((monthEnd.getDay() + 6) % 7))
  const dayCount =
    Math.round((parseLocalDate(gridEnd).getTime() - parseLocalDate(gridStart).getTime()) / 86400000) + 1

  return Array.from({ length: dayCount }, (_, index) => addLocalDays(gridStart, index))
}

export function getProgress(tasks: Array<Pick<PlanTask, "isCompleted">>) {
  const completed = tasks.filter((task) => task.isCompleted === 1).length

  return {
    completed,
    total: tasks.length,
    ratio: tasks.length === 0 ? 0 : completed / tasks.length,
  }
}

export function isOverdue(
  task: Pick<PlanTask, "scheduledDate" | "isCompleted">,
  today: string,
): boolean {
  if (task.isCompleted === 1) {
    return false
  }

  return task.scheduledDate < today
}

export function clampDateToRange(value: string, startDate: string, endDate: string): string {
  if (value < startDate) {
    return startDate
  }

  if (value > endDate) {
    return endDate
  }

  return value
}
