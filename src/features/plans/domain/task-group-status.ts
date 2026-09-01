import type { PlanTask, PlanTaskGroup } from "@/db/types"

export interface TaskGroupProgress {
  completed: number
  total: number
  ratio: number
}

export type TaskGroupStepState = "upcoming" | "current" | "completed" | "needs-reschedule"

function retired<T>(...ignored: unknown[]): T {
  void ignored
  throw new Error("跨日任务已停用")
}

/** Kept only for rollback compatibility; task-group status is no longer supported. */
export function getTaskGroupProgress(groupId: string, tasks: PlanTask[]): TaskGroupProgress {
  return retired(groupId, tasks)
}

/** Kept only for rollback compatibility; task-group status is no longer supported. */
export function getTaskGroupStepState(task: PlanTask, today: string): TaskGroupStepState {
  return retired(task, today)
}

/** Kept only for rollback compatibility; task-group status is no longer supported. */
export function groupOverlapsRange(group: PlanTaskGroup, startDate: string, endDate: string): boolean {
  return retired(group, startDate, endDate)
}
