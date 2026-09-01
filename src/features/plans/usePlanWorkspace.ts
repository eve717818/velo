import { useLiveQuery } from "dexie-react-hooks"
import type { LearningPeriod, PlanTask, PlanTaskGroup, RangePlan } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getMonthRange, getProgress, getWeekDates } from "./domain/plan-dates"
import { groupOverlapsRange } from "./domain/task-group-status"
import { getRangePlanId } from "./domain/range-plans"

export type PlanView = "day" | "week" | "month" | "period"

export interface PlanWorkspaceSnapshot {
  allTasks: PlanTask[]
  tasks: PlanTask[]
  allTaskGroups: PlanTaskGroup[]
  taskGroups: PlanTaskGroup[]
  taskGroupById: Record<string, PlanTaskGroup>
  periods: LearningPeriod[]
  selectedPeriod: LearningPeriod | null
  rangePlan: RangePlan | null
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
    const allTaskGroups = await db.planTaskGroups.toArray()
    const rangePlan = view === "week" || view === "month"
      ? await db.rangePlans.get(getRangePlanId(view, selectedDate)) ?? null
      : null
    const tasks = range
      ? allTasks.filter((task) => task.scheduledDate >= range.startDate && task.scheduledDate <= range.endDate)
      : []
    const taskGroups = range
      ? allTaskGroups.filter((group) => groupOverlapsRange(group, range.startDate, range.endDate))
      : []

    tasks.sort(compareTasks)

    return {
      tasks,
      allTasks,
      allTaskGroups,
      taskGroups,
      taskGroupById: Object.fromEntries(allTaskGroups.map((group) => [group.id, group])),
      periods,
      selectedPeriod,
      rangePlan,
      progress: getProgress(tasks),
    }
  }, [db, view, selectedDate, periodId])
}
