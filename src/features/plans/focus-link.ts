import type { PlanTask } from "@/db/types"

const DEFAULT_FOCUS_MINUTES = 25
const MAX_FOCUS_MINUTES = 24 * 60

function validFocusMinutes(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= MAX_FOCUS_MINUTES
}

export function buildFocusHref(task: Pick<PlanTask, "id" | "estimatedMinutes">): string {
  const minutes = validFocusMinutes(task.estimatedMinutes) ? task.estimatedMinutes : DEFAULT_FOCUS_MINUTES
  const params = new URLSearchParams({ task: task.id, minutes: String(minutes) })
  return `/focus?${params.toString()}`
}

export function readFocusMinutes(value: string | null): number {
  const minutes = value === null ? Number.NaN : Number(value)
  return validFocusMinutes(minutes) ? minutes : DEFAULT_FOCUS_MINUTES
}
