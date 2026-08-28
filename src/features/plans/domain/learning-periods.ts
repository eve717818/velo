import type { LearningPeriod, LearningPeriodKind, PlanTask } from "@/db/types"

import { parseLocalDate } from "./plan-dates"

export interface LearningPeriodInput {
  kind: LearningPeriodKind
  name: string
  startDate: string
  endDate: string
  goal?: string
}

export type PeriodValidation =
  | { ok: true }
  | { ok: false; field: "name" | "startDate" | "endDate"; message: string }

type LearningPeriodCandidate = LearningPeriodInput & Partial<Pick<LearningPeriod, "id">>

export function validateLearningPeriod(
  candidate: LearningPeriodCandidate,
  existingPeriods: LearningPeriod[],
): PeriodValidation {
  if (candidate.name.trim().length === 0) {
    return { ok: false, field: "name", message: "Learning period name is required" }
  }

  try {
    parseLocalDate(candidate.startDate)
  } catch {
    return { ok: false, field: "startDate", message: "Start date must be a valid local date" }
  }

  try {
    parseLocalDate(candidate.endDate)
  } catch {
    return { ok: false, field: "endDate", message: "End date must be a valid local date" }
  }

  if (candidate.startDate > candidate.endDate) {
    return { ok: false, field: "endDate", message: "End date must be on or after the start date" }
  }

  const overlap = existingPeriods.find((period) => {
    if (period.id === candidate.id) {
      return false
    }

    return candidate.startDate <= period.endDate && candidate.endDate >= period.startDate
  })

  if (overlap) {
    return { ok: false, field: "startDate", message: "Learning period overlaps an existing period" }
  }

  return { ok: true }
}

export function findPeriodForDate(periods: LearningPeriod[], value: string): LearningPeriod | undefined {
  return periods.find((period) => value >= period.startDate && value <= period.endDate)
}

export function countTasksInPeriod(tasks: Pick<PlanTask, "scheduledDate">[], period: Pick<LearningPeriod, "startDate" | "endDate">) {
  return tasks.filter((task) => task.scheduledDate >= period.startDate && task.scheduledDate <= period.endDate).length
}
