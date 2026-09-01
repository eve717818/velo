import type { LearningPeriod, PlanTaskScope } from "@/db/types"
import { formatLocalDate } from "../../../lib/local-date"
import { addLocalDays, getWeekDates, parseLocalDate } from "./plan-dates"

export function getPlanPeriodKey(scope: PlanTaskScope, selectedDate: string, periodId?: string) {
  if (scope === "day") return selectedDate
  if (scope === "week") return getWeekDates(selectedDate)[0]
  if (scope === "month") return selectedDate.slice(0, 7)
  return periodId ?? null
}

export function assertValidPlanPeriodKey(scope: PlanTaskScope, periodKey: string) {
  if (scope === "day" || scope === "week") {
    try {
      parseLocalDate(periodKey)
    } catch {
      throw new Error(scope === "day" ? "日计划周期无效" : "周计划周期无效")
    }
    if (scope === "week" && getWeekDates(periodKey)[0] !== periodKey) throw new Error("周计划周期无效")
    return
  }
  if (scope === "month") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new Error("月计划周期无效")
    return
  }
  if (!periodKey.trim()) throw new Error("请选择有效的学期或假期")
}

export function shiftPlanPeriod(scope: Exclude<PlanTaskScope, "semester">, selectedDate: string, amount: number) {
  if (scope === "day") return addLocalDays(selectedDate, amount)
  if (scope === "week") return addLocalDays(selectedDate, amount * 7)
  const value = parseLocalDate(selectedDate)
  const targetYear = value.getFullYear()
  const targetMonth = value.getMonth() + amount
  const targetMonthLastDay = new Date(targetYear, targetMonth + 1, 0, 12).getDate()
  return formatLocalDate(new Date(targetYear, targetMonth, Math.min(value.getDate(), targetMonthLastDay), 12))
}

export function formatPlanPeriodLabel(scope: PlanTaskScope, selectedDate: string, period?: LearningPeriod) {
  if (scope === "day") return selectedDate
  if (scope === "week") {
    const dates = getWeekDates(selectedDate).map(parseLocalDate)
    return `${dates[0].getMonth() + 1}月${dates[0].getDate()}日—${dates[6].getMonth() + 1}月${dates[6].getDate()}日`
  }
  if (scope === "month") {
    const value = parseLocalDate(`${selectedDate.slice(0, 7)}-01`)
    return `${value.getFullYear()}年${value.getMonth() + 1}月`
  }
  return period?.name ?? "选择学期或假期"
}
