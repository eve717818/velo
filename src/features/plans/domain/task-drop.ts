import { parseLocalDate } from "./plan-dates"

export interface TaskDropTarget {
  scope: "day"
  periodKey: string
  startMinutes?: number
}

function isValidStartMinutes(value: string): boolean {
  if (!/^\d+$/.test(value)) return false

  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1439
}

export function readTaskDropTarget(element: HTMLElement): TaskDropTarget | null {
  const target = element.closest<HTMLElement>("[data-drop-period-key]")
  const periodKey = target?.dataset.dropPeriodKey
  if (!periodKey) return null

  try {
    parseLocalDate(periodKey)
  } catch {
    return null
  }

  const rawMinutes = target.dataset.startMinutes
  if (rawMinutes === undefined) {
    return { scope: "day", periodKey, startMinutes: undefined }
  }

  if (!isValidStartMinutes(rawMinutes)) return null
  return { scope: "day", periodKey, startMinutes: Number(rawMinutes) }
}
