import type { PlanTask, PlanTaskGroup } from "@/db/types"

export interface TaskGroupProgress {
  completed: number
  total: number
  ratio: number
}

export type TaskGroupStepState = "upcoming" | "current" | "completed" | "needs-reschedule"

export function getTaskGroupProgress(groupId: string, tasks: PlanTask[]): TaskGroupProgress {
  const groupTasks = tasks.filter((task) => task.groupId === groupId)
  const completed = groupTasks.filter((task) => task.isCompleted === 1).length
  return {
    completed,
    total: groupTasks.length,
    ratio: groupTasks.length === 0 ? 0 : completed / groupTasks.length,
  }
}

export function getTaskGroupStepState(task: PlanTask, today: string): TaskGroupStepState {
  if (task.isCompleted === 1) return "completed"
  if (task.scheduledDate < today) return "needs-reschedule"
  if (task.scheduledDate === today) return "current"
  return "upcoming"
}

export function groupOverlapsRange(
  group: PlanTaskGroup,
  startDate: string,
  endDate: string,
): boolean {
  return group.startDate <= endDate && group.endDate >= startDate
}
