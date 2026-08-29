import { parseLocalDate } from "./plan-dates"

export interface TaskDropTarget {
  scheduledDate: string
  startMinutes?: number
}

function isValidStartMinutes(value: string): boolean {
  if (!/^\d+$/.test(value)) return false

  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1439
}

export function readTaskDropTarget(element: HTMLElement): TaskDropTarget | null {
  const target = element.closest<HTMLElement>("[data-drop-date]")
  const scheduledDate = target?.dataset.dropDate
  if (!scheduledDate) return null

  try {
    parseLocalDate(scheduledDate)
  } catch {
    return null
  }

  const rawMinutes = target.dataset.startMinutes
  if (rawMinutes === undefined) {
    return { scheduledDate, startMinutes: undefined }
  }

  if (!isValidStartMinutes(rawMinutes)) return null
  return { scheduledDate, startMinutes: Number(rawMinutes) }
}
