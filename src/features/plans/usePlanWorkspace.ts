import { useLiveQuery } from "dexie-react-hooks"
import type { LearningPeriod, PlanTask, PlanTaskScope } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getProgress } from "./domain/plan-dates"
import { getPlanPeriodKey } from "./domain/plan-period-keys"

export type PlanView = "day" | "week" | "month" | "period"

export interface PlanWorkspaceSnapshot {
  scope: PlanTaskScope
  periodKey: string | null
  tasks: PlanTask[]
  periods: LearningPeriod[]
  selectedPeriod: LearningPeriod | null
  progress: { completed: number; total: number; ratio: number }
}

interface UsePlanWorkspaceOptions {
  db: VeloDB
  view: PlanView
  selectedDate: string
  periodId?: string
}

function compareDayTasks(left: PlanTask, right: PlanTask) {
  return (
    (left.startMinutes ?? Number.MAX_SAFE_INTEGER) - (right.startMinutes ?? Number.MAX_SAFE_INTEGER) ||
    left.order - right.order
  )
}

export function usePlanWorkspace({ db, view, selectedDate, periodId }: UsePlanWorkspaceOptions) {
  return useLiveQuery<PlanWorkspaceSnapshot>(async () => {
    const periods = await db.learningPeriods.orderBy("startDate").toArray()
    const selectedPeriod = periods.find(({ id }) => id === periodId) ?? null
    const scope = view === "period" ? "semester" : view
    const periodKey = getPlanPeriodKey(scope, selectedDate, selectedPeriod?.id)
    const tasks = periodKey
      ? await db.planTasks.where("[scope+periodKey]").equals([scope, periodKey]).sortBy("order")
      : []

    if (scope === "day") tasks.sort(compareDayTasks)

    return {
      scope,
      periodKey,
      tasks,
      periods,
      selectedPeriod,
      progress: getProgress(tasks),
    }
  }, [db, view, selectedDate, periodId])
}
