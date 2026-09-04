import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import type { LearningPeriod, PlanTaskScope } from "@/db/types"
import { formatPlanPeriodLabel, shiftPlanPeriod } from "@/features/plans/domain/plan-period-keys"
import styles from "../PlansPage.module.css"

export interface PlanPeriodNavigatorProps {
  scope: PlanTaskScope
  selectedDate: string
  period?: LearningPeriod | null
  periods?: LearningPeriod[]
  onDateChange?: (date: string) => void
  onPeriodChange?: (periodId: string) => void
  onManagePeriods?: () => void
}

const navigationCopy = {
  day: { next: "下一日", previous: "上一日" },
  week: { next: "下一周", previous: "上一周" },
  month: { next: "下一月", previous: "上一月" },
} as const

export function PlanPeriodNavigator({
  onDateChange,
  onManagePeriods,
  onPeriodChange,
  period,
  periods = [],
  scope,
  selectedDate,
}: PlanPeriodNavigatorProps) {
  if (scope === "semester") {
    return (
      <section aria-label="学期与假期导航" className={styles.periodNavigator}>
        <label className={styles.periodNavigatorPicker}>
          <span>选择学期或假期</span>
          <select aria-label="选择学期或假期" className={styles.periodPicker} onChange={(event) => onPeriodChange?.(event.target.value)} value={period?.id ?? ""}>
            <option disabled value="">选择学期或假期</option>
            {periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className={styles.periodNavigatorControl} onClick={onManagePeriods} type="button"><CalendarDays aria-hidden="true" />管理学期与假期</button>
      </section>
    )
  }

  const calendarScope = scope
  const copy = navigationCopy[calendarScope]
  const inputType = calendarScope === "month" ? "month" : "date"
  const inputValue = calendarScope === "month" ? selectedDate.slice(0, 7) : selectedDate
  const label = formatPlanPeriodLabel(calendarScope, selectedDate)

  function changeBy(amount: number) {
    onDateChange?.(shiftPlanPeriod(calendarScope, selectedDate, amount))
  }

  function changeFromInput(value: string) {
    if (!value) return
    onDateChange?.(calendarScope === "month" ? `${value}-01` : value)
  }

  return (
    <section aria-label="计划周期导航" className={styles.periodNavigator}>
      <button aria-label={copy.previous} className={styles.periodNavigatorControl} onClick={() => changeBy(-1)} type="button"><ChevronLeft aria-hidden="true" /></button>
      <div className={styles.periodNavigatorTitle}>
        <h2>{label}</h2>
        <label>
          <span className={styles.srOnly}>选择计划日期</span>
          <input aria-label="选择计划日期" className={styles.periodPicker} onChange={(event) => changeFromInput(event.target.value)} type={inputType} value={inputValue} />
        </label>
      </div>
      <button aria-label={copy.next} className={styles.periodNavigatorControl} onClick={() => changeBy(1)} type="button"><ChevronRight aria-hidden="true" /></button>
    </section>
  )
}
