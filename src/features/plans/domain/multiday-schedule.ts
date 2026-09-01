import type { PlanTask, PlanTaskGroup } from "@/db/types"

export interface ScheduleRequest {
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
}

export interface ScheduledStepDraft {
  scheduledDate: string
  stepIndex: number
}

export interface RescheduleProposal {
  taskId: string
  previousDate: string
  scheduledDate: string
}

function retired<T>(...ignored: unknown[]): T {
  void ignored
  throw new Error("跨日任务已停用")
}

/** Kept only for rollback compatibility; cross-day scheduling has been retired. */
export function buildMultiDaySchedule(request: ScheduleRequest, existingTasks: PlanTask[]): ScheduledStepDraft[] {
  return retired(request, existingTasks)
}

/** Kept only for rollback compatibility; cross-day scheduling has been retired. */
export function buildOverdueRescheduleProposal(
  group: PlanTaskGroup,
  groupTasks: PlanTask[],
  allTasks: PlanTask[],
  today: string,
): RescheduleProposal[] {
  return retired(group, groupTasks, allTasks, today)
}
