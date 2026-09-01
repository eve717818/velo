import type { PlanTask, PlanTaskStepTitleMode } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import type { RescheduleProposal } from "../domain/multiday-schedule"

export interface PlanTaskStepInput {
  scheduledDate: string
  stepIndex: number
  stepTitleMode: PlanTaskStepTitleMode
  title: string
}

export interface CreatePlanTaskGroupInput {
  title: string
  subject?: string
  notes?: string
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
  steps: PlanTaskStepInput[]
  confirmedRemovedStepIds?: string[]
}

function retired<T>(...ignored: unknown[]): Promise<T> {
  void ignored
  return Promise.reject(new Error("跨日任务已停用"))
}

export function createPlanTaskGroup(
  db: VeloDB,
  input: CreatePlanTaskGroupInput,
  now: number,
): Promise<{ group: never; tasks: PlanTask[] }> {
  return retired(db, input, now)
}

export function updatePlanTaskGroup(
  db: VeloDB,
  id: string,
  input: CreatePlanTaskGroupInput,
  now: number,
): Promise<{ group: never; tasks: PlanTask[] }> {
  return retired(db, id, input, now)
}

export function applyTaskGroupSchedule(
  db: VeloDB,
  groupId: string,
  proposals: RescheduleProposal[],
  now: number,
): Promise<PlanTask[]> {
  return retired(db, groupId, proposals, now)
}

export function deletePlanTaskGroup(
  db: VeloDB,
  groupId: string,
): Promise<{ deletedTaskCount: number }> {
  return retired(db, groupId)
}
