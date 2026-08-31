import type { LearningPeriod, PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { parseLocalDate } from "../domain/plan-dates"
import { getNextTaskOrder } from "./task-order"

export interface CreatePlanTaskInput {
  title: string
  scheduledDate: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
}

export type UpdatePlanTaskInput = CreatePlanTaskInput

export interface MovePlanTaskInput {
  scheduledDate: string
  startMinutes?: number
  order?: number
  expectedPosition?: {
    scheduledDate: string
    startMinutes: number | undefined
    order: number
  }
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeTaskInput<T extends CreatePlanTaskInput | MovePlanTaskInput>(input: T): T {
  return {
    ...input,
    title: "title" in input ? input.title.trim() : undefined,
    subject: "subject" in input ? normalizeText(input.subject) : undefined,
    notes: "notes" in input ? normalizeText(input.notes) : undefined,
  }
}

function assertValidScheduledDate(value: string) {
  try {
    parseLocalDate(value)
  } catch {
    throw new Error("任务日期无效")
  }
}

function assertValidStartMinutes(value: number | undefined) {
  if (value === undefined) {
    return
  }

  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new Error("开始时间必须在 0 到 1439 分钟之间")
  }
}

function assertValidEstimate(value: number | undefined) {
  if (value === undefined) {
    return
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("预计时长必须大于 0")
  }
  if (!Number.isInteger(value)) {
    throw new Error("预计时长必须是正整数")
  }
}

function assertValidTaskInput(input: CreatePlanTaskInput) {
  if (input.title.trim().length === 0) {
    throw new Error("任务名称不能为空")
  }

  assertValidScheduledDate(input.scheduledDate)
  assertValidStartMinutes(input.startMinutes)
  assertValidEstimate(input.estimatedMinutes)
}

function assertValidMoveInput(input: MovePlanTaskInput) {
  assertValidScheduledDate(input.scheduledDate)
  assertValidStartMinutes(input.startMinutes)
  if (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 0)) {
    throw new Error("任务排序必须是非负整数")
  }
}

function isSameLane(task: Pick<PlanTask, "startMinutes">, startMinutes: number | undefined) {
  return (task.startMinutes === undefined) === (startMinutes === undefined)
}

function isSamePosition(
  task: Pick<PlanTask, "scheduledDate" | "startMinutes" | "order">,
  expected: NonNullable<MovePlanTaskInput["expectedPosition"]>,
) {
  return task.scheduledDate === expected.scheduledDate && task.startMinutes === expected.startMinutes && task.order === expected.order
}

function shouldReassignOrder(task: Pick<PlanTask, "scheduledDate" | "startMinutes">, input: Pick<UpdatePlanTaskInput, "scheduledDate" | "startMinutes">) {
  return task.scheduledDate !== input.scheduledDate || !isSameLane(task, input.startMinutes)
}

function resolveCopyScheduledDate(targetPeriod: Pick<LearningPeriod, "startDate" | "endDate">, today: string) {
  if (today >= targetPeriod.startDate && today <= targetPeriod.endDate) {
    return today
  }

  return targetPeriod.startDate
}

export async function createPlanTask(db: VeloDB, input: CreatePlanTaskInput, now: number): Promise<PlanTask> {
  assertValidTaskInput(input)
  const normalized = normalizeTaskInput(input)

  return db.transaction("rw", db.planTasks, async () => {
    const created: PlanTask = {
      id: crypto.randomUUID(),
      title: normalized.title,
      scheduledDate: normalized.scheduledDate,
      startMinutes: normalized.startMinutes,
      subject: normalized.subject,
      estimatedMinutes: normalized.estimatedMinutes,
      notes: normalized.notes,
      isCompleted: 0,
      completedAt: undefined,
      order: await getNextTaskOrder(db, normalized.scheduledDate, normalized.startMinutes),
      createdAt: now,
      updatedAt: now,
    }

    await db.planTasks.add(created)
    return created
  })
}

export async function updatePlanTask(db: VeloDB, id: string, input: UpdatePlanTaskInput, now: number): Promise<PlanTask> {
  assertValidTaskInput(input)
  const normalized = normalizeTaskInput(input)

  return db.transaction("rw", db.planTasks, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      throw new Error("Plan task not found")
    }

    const order = shouldReassignOrder(existing, normalized)
      ? await getNextTaskOrder(db, normalized.scheduledDate, normalized.startMinutes)
      : existing.order

    const updated: PlanTask = {
      ...existing,
      id,
      title: normalized.title,
      scheduledDate: normalized.scheduledDate,
      startMinutes: normalized.startMinutes,
      subject: normalized.subject,
      estimatedMinutes: normalized.estimatedMinutes,
      notes: normalized.notes,
      order,
      updatedAt: now,
    }

    await db.planTasks.put(updated)
    return updated
  })
}

export async function deletePlanTask(db: VeloDB, id: string): Promise<boolean> {
  return db.transaction("rw", db.planTasks, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      return false
    }

    await db.planTasks.delete(id)
    return true
  })
}

export async function setTaskCompletion(db: VeloDB, id: string, isCompleted: boolean, now: number): Promise<PlanTask> {
  return db.transaction("rw", db.planTasks, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      throw new Error("Plan task not found")
    }

    const updated: PlanTask = {
      ...existing,
      isCompleted: isCompleted ? 1 : 0,
      completedAt: isCompleted ? now : undefined,
      updatedAt: now,
    }

    await db.planTasks.put(updated)
    return updated
  })
}

export async function movePlanTask(db: VeloDB, id: string, input: MovePlanTaskInput, now: number): Promise<PlanTask> {
  assertValidMoveInput(input)
  const normalized = normalizeTaskInput(input)

  return db.transaction("rw", db.planTasks, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      throw new Error("Plan task not found")
    }
    if (normalized.expectedPosition && !isSamePosition(existing, normalized.expectedPosition)) {
      throw new Error("任务位置已变化，请重试")
    }

    const updated: PlanTask = {
      ...existing,
      scheduledDate: normalized.scheduledDate,
      startMinutes: normalized.startMinutes,
      order: normalized.order ?? (await getNextTaskOrder(db, normalized.scheduledDate, normalized.startMinutes)),
      updatedAt: now,
    }

    await db.planTasks.put(updated)
    return updated
  })
}

export async function copyTasksToPeriod(
  db: VeloDB,
  sourceIds: string[],
  targetPeriod: LearningPeriod,
  today: string,
  now: number,
): Promise<string[]> {
  if (targetPeriod.endDate < today) {
    throw new Error("不能复制到已结束的学习周期")
  }
  const scheduledDate = resolveCopyScheduledDate(targetPeriod, today)
  assertValidScheduledDate(scheduledDate)

  return db.transaction("rw", db.planTasks, async () => copyTasksToPeriodInTransaction(db, sourceIds, scheduledDate, now))
}

async function copyTasksToPeriodInTransaction(db: VeloDB, sourceIds: string[], scheduledDate: string, now: number): Promise<string[]> {
  const sourceTasks = await db.planTasks.bulkGet(sourceIds)
  const missingIndex = sourceTasks.findIndex((task) => !task)
  if (missingIndex >= 0) {
    throw new Error(`Plan task not found: ${sourceIds[missingIndex]}`)
  }

  let nextOrder = await getNextTaskOrder(db, scheduledDate, undefined)
  const copiedTasks = sourceTasks.map((task) => ({
    id: crypto.randomUUID(),
    title: task!.title,
    scheduledDate,
    startMinutes: undefined,
    subject: task!.subject,
    estimatedMinutes: task!.estimatedMinutes,
    notes: task!.notes,
    isCompleted: 0 as const,
    completedAt: undefined,
    order: nextOrder++,
    createdAt: now,
    updatedAt: now,
  }))

  const newIds: string[] = []
  for (const copiedTask of copiedTasks) {
    await db.planTasks.add(copiedTask)
    newIds.push(copiedTask.id)
  }

  return newIds
}

export async function copyTasksToPeriodAndDismiss(
  db: VeloDB,
  sourceIds: string[],
  targetPeriod: LearningPeriod,
  sourcePeriodId: string,
  today: string,
  now: number,
): Promise<string[]> {
  if (targetPeriod.endDate < today) {
    throw new Error("不能复制到已结束的学习周期")
  }
  const scheduledDate = resolveCopyScheduledDate(targetPeriod, today)
  assertValidScheduledDate(scheduledDate)
  const dismissalKey = `periodMigrationDismissed:${sourcePeriodId}:${targetPeriod.id}`

  return db.transaction("rw", db.planTasks, db.appMeta, async () => {
    const copiedIds = await copyTasksToPeriodInTransaction(db, sourceIds, scheduledDate, now)
    await db.appMeta.put({ key: dismissalKey, value: "1", updatedAt: now })
    return copiedIds
  })
}
