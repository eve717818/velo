import { useLiveQuery } from "dexie-react-hooks"
import type { LearningPeriod, PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getMonthRange, getProgress, getWeekDates } from "./domain/plan-dates"

export type PlanView = "day" | "week" | "month" | "period"

export interface PlanWorkspaceSnapshot {
  allTasks: PlanTask[]
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

function getViewRange(
  view: PlanView,
  selectedDate: string,
  selectedPeriod: LearningPeriod | null,
): { startDate: string; endDate: string } | null {
  if (view === "day") {
    return { startDate: selectedDate, endDate: selectedDate }
  }

  if (view === "week") {
    const dates = getWeekDates(selectedDate)
    return { startDate: dates[0], endDate: dates[dates.length - 1] }
  }

  if (view === "month") {
    return getMonthRange(selectedDate)
  }

  return selectedPeriod
    ? { startDate: selectedPeriod.startDate, endDate: selectedPeriod.endDate }
    : null
}

function compareTasks(left: PlanTask, right: PlanTask) {
  return (
    left.scheduledDate.localeCompare(right.scheduledDate) ||
    (left.startMinutes ?? Number.MAX_SAFE_INTEGER) - (right.startMinutes ?? Number.MAX_SAFE_INTEGER) ||
    left.order - right.order
  )
}

export function usePlanWorkspace({ db, view, selectedDate, periodId }: UsePlanWorkspaceOptions) {
  return useLiveQuery<PlanWorkspaceSnapshot>(async () => {
    const periods = await db.learningPeriods.orderBy("startDate").toArray()
    const selectedPeriod = periods.find(({ id }) => id === periodId) ?? null
    const range = getViewRange(view, selectedDate, selectedPeriod)
    const allTasks = await db.planTasks.toArray()
    const tasks = range
      ? allTasks.filter((task) => task.scheduledDate >= range.startDate && task.scheduledDate <= range.endDate)
      : []

    tasks.sort(compareTasks)

    return {
      tasks,
      allTasks,
      periods,
      selectedPeriod,
      progress: getProgress(tasks),
    }
  }, [db, view, selectedDate, periodId])
}
