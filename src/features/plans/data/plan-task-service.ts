import type { LearningPeriod, PlanTask, PlanTaskScope } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { assertValidPlanPeriodKey } from "../domain/plan-period-keys"
import { getNextTaskOrder } from "./task-order"

export interface PlanTaskLocation {
  scope: PlanTaskScope
  periodKey: string
  startMinutes?: number
  order: number
}

export interface CreatePlanTaskInput {
  scope: PlanTaskScope
  periodKey: string
  title: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
}

export type UpdatePlanTaskInput = CreatePlanTaskInput

export interface MovePlanTaskInput {
  scope: PlanTaskScope
  periodKey: string
  startMinutes?: number
  order?: number
  expectedPosition?: PlanTaskLocation
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeTaskInput<T extends CreatePlanTaskInput>(input: T): T {
  return {
    ...input,
    title: input.title.trim(),
    subject: normalizeText(input.subject),
    notes: normalizeText(input.notes),
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

  assertValidTaskLocation(input.scope, input.periodKey, input.startMinutes)
  assertValidEstimate(input.estimatedMinutes)
}

function assertValidTaskLocation(scope: PlanTaskScope, periodKey: string, startMinutes: number | undefined) {
  assertValidPlanPeriodKey(scope, periodKey)
  if (scope !== "day" && startMinutes !== undefined) {
    throw new Error("只有日计划任务可以设置时间")
  }
  assertValidStartMinutes(startMinutes)
}

function assertValidMoveInput(input: MovePlanTaskInput) {
  assertValidTaskLocation(input.scope, input.periodKey, input.startMinutes)
  if (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 0)) {
    throw new Error("任务排序必须是非负整数")
  }
}

async function assertSemesterPeriodExists(db: VeloDB, scope: PlanTaskScope, periodKey: string) {
  if (scope === "semester" && !(await db.learningPeriods.get(periodKey))) {
    throw new Error("请选择有效的学期或假期")
  }
}

function isSameLane(task: Pick<PlanTask, "scope" | "startMinutes">, startMinutes: number | undefined) {
  return task.scope !== "day" || (task.startMinutes === undefined) === (startMinutes === undefined)
}

function isSamePosition(
  task: PlanTaskLocation,
  expected: NonNullable<MovePlanTaskInput["expectedPosition"]>,
) {
  return task.scope === expected.scope && task.periodKey === expected.periodKey && task.startMinutes === expected.startMinutes && task.order === expected.order
}

function shouldReassignOrder(task: Pick<PlanTask, "scope" | "periodKey" | "startMinutes">, input: Pick<UpdatePlanTaskInput, "periodKey" | "startMinutes">) {
  return task.periodKey !== input.periodKey || !isSameLane(task, input.startMinutes)
}

export async function createPlanTask(db: VeloDB, input: CreatePlanTaskInput, now: number): Promise<PlanTask> {
  assertValidTaskInput(input)
  const normalized = normalizeTaskInput(input)

  return db.transaction("rw", db.planTasks, db.learningPeriods, async () => {
    await assertSemesterPeriodExists(db, normalized.scope, normalized.periodKey)
    const created: PlanTask = {
      id: crypto.randomUUID(),
      title: normalized.title,
      scope: normalized.scope,
      periodKey: normalized.periodKey,
      startMinutes: normalized.startMinutes,
      subject: normalized.subject,
      estimatedMinutes: normalized.estimatedMinutes,
      notes: normalized.notes,
      isCompleted: 0,
      completedAt: undefined,
      order: await getNextTaskOrder(db, normalized.scope, normalized.periodKey, normalized.startMinutes),
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

  return db.transaction("rw", db.planTasks, db.learningPeriods, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      throw new Error("Plan task not found")
    }
    if (normalized.scope !== existing.scope) {
      throw new Error("不能跨计划层级移动任务")
    }
    await assertSemesterPeriodExists(db, normalized.scope, normalized.periodKey)

    const order = shouldReassignOrder(existing, normalized)
      ? await getNextTaskOrder(db, normalized.scope, normalized.periodKey, normalized.startMinutes)
      : existing.order

    const updated: PlanTask = {
      ...existing,
      id,
      title: normalized.title,
      scope: normalized.scope,
      periodKey: normalized.periodKey,
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

  return db.transaction("rw", db.planTasks, db.learningPeriods, async () => {
    const existing = await db.planTasks.get(id)
    if (!existing) {
      throw new Error("Plan task not found")
    }
    if (input.scope !== existing.scope) {
      throw new Error("不能跨计划层级移动任务")
    }
    await assertSemesterPeriodExists(db, input.scope, input.periodKey)
    if (input.expectedPosition && !isSamePosition(existing, input.expectedPosition)) {
      throw new Error("任务位置已变化，请重试")
    }

    const updated: PlanTask = {
      ...existing,
      scope: input.scope,
      periodKey: input.periodKey,
      startMinutes: input.startMinutes,
      order: input.order ?? (await getNextTaskOrder(db, input.scope, input.periodKey, input.startMinutes)),
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

  return db.transaction("rw", db.planTasks, db.learningPeriods, async () => {
    await assertSemesterPeriodExists(db, "semester", targetPeriod.id)
    return copyTasksToPeriodInTransaction(db, sourceIds, targetPeriod.id, now)
  })
}

async function copyTasksToPeriodInTransaction(db: VeloDB, sourceIds: string[], periodKey: string, now: number): Promise<string[]> {
  const sourceTasks = await db.planTasks.bulkGet(sourceIds)
  const missingIndex = sourceTasks.findIndex((task) => !task)
  if (missingIndex >= 0) {
    throw new Error(`Plan task not found: ${sourceIds[missingIndex]}`)
  }

  let nextOrder = await getNextTaskOrder(db, "semester", periodKey, undefined)
  const copiedTasks = sourceTasks.map((task) => ({
    id: crypto.randomUUID(),
    title: task!.title,
    scope: "semester" as const,
    periodKey,
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
  const dismissalKey = `periodMigrationDismissed:${sourcePeriodId}:${targetPeriod.id}`

  return db.transaction("rw", db.planTasks, db.learningPeriods, db.appMeta, async () => {
    await assertSemesterPeriodExists(db, "semester", targetPeriod.id)
    const copiedIds = await copyTasksToPeriodInTransaction(db, sourceIds, targetPeriod.id, now)
    await db.appMeta.put({ key: dismissalKey, value: "1", updatedAt: now })
    return copiedIds
  })
}
