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
    return { ok: false, field: "name", message: "请填写学期或假期名称" }
  }

  try {
    parseLocalDate(candidate.startDate)
  } catch {
    return { ok: false, field: "startDate", message: "开始日期无效" }
  }

  try {
    parseLocalDate(candidate.endDate)
  } catch {
    return { ok: false, field: "endDate", message: "结束日期无效" }
  }

  if (candidate.startDate > candidate.endDate) {
    return { ok: false, field: "endDate", message: "结束日期不能早于开始日期" }
  }

  const overlap = existingPeriods.find((period) => {
    if (period.id === candidate.id) {
      return false
    }

    return candidate.startDate <= period.endDate && candidate.endDate >= period.startDate
  })

  if (overlap) {
    return { ok: false, field: "startDate", message: "学期与假期不能重叠" }
  }

  return { ok: true }
}

export function findPeriodForDate(periods: LearningPeriod[], value: string): LearningPeriod | undefined {
  return periods.find((period) => value >= period.startDate && value <= period.endDate)
}

export function countTasksInPeriod(tasks: Pick<PlanTask, "scheduledDate">[], period: Pick<LearningPeriod, "startDate" | "endDate">) {
  return tasks.filter((task) => task.scheduledDate >= period.startDate && task.scheduledDate <= period.endDate).length
}
