import type { PlanTask, PlanTaskGroup, PlanTaskStepTitleMode } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import type { RescheduleProposal } from "../domain/multiday-schedule"
import { parseLocalDate } from "../domain/plan-dates"
import { getNextTaskOrder } from "./task-order"

export interface PlanTaskStepInput {
  scheduledDate: string
  title: string
  stepIndex: number
  stepTitleMode: PlanTaskStepTitleMode
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

export async function createPlanTaskGroup(
  db: VeloDB,
  input: CreatePlanTaskGroupInput,
  now: number,
): Promise<{ group: PlanTaskGroup; tasks: PlanTask[] }> {
  const normalized = normalizeAndValidateInput(input)
  const group: PlanTaskGroup = {
    id: crypto.randomUUID(),
    title: normalized.title,
    subject: normalized.subject,
    notes: normalized.notes,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    sessionCount: normalized.sessionCount,
    estimatedMinutes: normalized.estimatedMinutes,
    createdAt: now,
    updatedAt: now,
  }

  return db.transaction("rw", db.planTaskGroups, db.planTasks, async () => {
    const tasks: PlanTask[] = []
    for (const step of normalized.steps) {
      tasks.push(await createTaskFromStep(db, group.id, normalized, step, now))
    }

    await db.planTaskGroups.add(group)
    await db.planTasks.bulkAdd(tasks)
    return { group, tasks }
  })
}

export async function updatePlanTaskGroup(
  db: VeloDB,
  id: string,
  input: CreatePlanTaskGroupInput,
  now: number,
): Promise<{ group: PlanTaskGroup; tasks: PlanTask[] }> {
  const normalized = normalizeAndValidateInput(input)

  return db.transaction("rw", db.planTaskGroups, db.planTasks, async () => {
    const existingGroup = await db.planTaskGroups.get(id)
    if (!existingGroup) throw new Error("Plan task group not found")

    const existingTasks = await db.planTasks.where("groupId").equals(id).toArray()
    const existingByIndex = new Map<number, PlanTask>()
    for (const task of existingTasks) {
      if (task.stepIndex === undefined || existingByIndex.has(task.stepIndex)) {
        throw new Error("任务组步骤数据不完整")
      }
      existingByIndex.set(task.stepIndex, task)
    }

    const desiredIndices = new Set(normalized.steps.map((step) => step.stepIndex))
    const omittedTasks = existingTasks.filter((task) => !desiredIndices.has(task.stepIndex ?? -1))
    if (omittedTasks.some((task) => task.isCompleted === 1)) {
      throw new Error("不能删除已完成的学习步骤")
    }

    const completedTasks = existingTasks.filter((task) => task.isCompleted === 1)
    if (normalized.sessionCount < completedTasks.length) {
      throw new Error("学习次数不能少于已完成步骤数量")
    }
    if (
      completedTasks.some(
        (task) => task.scheduledDate < normalized.startDate || task.scheduledDate > normalized.endDate,
      )
    ) {
      throw new Error("新的任务周期不能排除已完成步骤")
    }

    assertConfirmedRemovals(omittedTasks, normalized.confirmedRemovedStepIds)

    const tasks: PlanTask[] = []
    for (const step of normalized.steps) {
      const existing = existingByIndex.get(step.stepIndex)
      if (!existing) {
        tasks.push(await createTaskFromStep(db, id, normalized, step, now))
        continue
      }
      if (existing.isCompleted === 1) {
        tasks.push(existing)
        continue
      }

      const preservesCustomTitle = existing.stepTitleMode === "custom"
      tasks.push({
        ...existing,
        title: preservesCustomTitle ? existing.title : step.title,
        scheduledDate: step.scheduledDate,
        subject: normalized.subject,
        estimatedMinutes: normalized.estimatedMinutes,
        notes: normalized.notes,
        stepTitleMode: preservesCustomTitle ? "custom" : step.stepTitleMode,
        order:
          existing.scheduledDate === step.scheduledDate
            ? existing.order
            : await getNextTaskOrder(db, step.scheduledDate, undefined),
        updatedAt: now,
      })
    }

    assertUniqueTaskDates(tasks)
    const updatedGroup: PlanTaskGroup = {
      ...existingGroup,
      title: normalized.title,
      subject: normalized.subject,
      notes: normalized.notes,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      sessionCount: normalized.sessionCount,
      estimatedMinutes: normalized.estimatedMinutes,
      updatedAt: now,
    }

    await db.planTasks.bulkDelete(omittedTasks.map((task) => task.id))
    await db.planTasks.bulkPut(tasks)
    await db.planTaskGroups.put(updatedGroup)
    return { group: updatedGroup, tasks: sortByStepIndex(tasks) }
  })
}

export async function applyTaskGroupSchedule(
  db: VeloDB,
  groupId: string,
  proposals: RescheduleProposal[],
  now: number,
): Promise<PlanTask[]> {
  return db.transaction("rw", db.planTaskGroups, db.planTasks, async () => {
    const group = await db.planTaskGroups.get(groupId)
    if (!group) throw new Error("Plan task group not found")

    const taskIds = proposals.map((proposal) => proposal.taskId)
    if (new Set(taskIds).size !== taskIds.length) throw new Error("调整建议包含重复步骤")
    const proposedTasks = await db.planTasks.bulkGet(taskIds)

    const updatedTasks: PlanTask[] = []
    for (let index = 0; index < proposals.length; index += 1) {
      const proposal = proposals[index]
      const task = proposedTasks[index]
      if (!task || task.groupId !== groupId) throw new Error("调整建议包含其他任务组的步骤")
      if (task.isCompleted === 1) throw new Error("不能调整已完成的学习步骤")
      if (task.scheduledDate !== proposal.previousDate) throw new Error("步骤日期已变化，请重新生成建议")
      assertValidDate(proposal.scheduledDate)
      if (proposal.scheduledDate < group.startDate || proposal.scheduledDate > group.endDate) {
        throw new Error("步骤日期必须在任务周期内")
      }
      updatedTasks.push({
        ...task,
        scheduledDate: proposal.scheduledDate,
        order:
          task.scheduledDate === proposal.scheduledDate
            ? task.order
            : await getNextTaskOrder(db, proposal.scheduledDate, task.startMinutes),
        updatedAt: now,
      })
    }

    const currentTasks = await db.planTasks.where("groupId").equals(groupId).toArray()
    const reconciled = currentTasks.map(
      (task) => updatedTasks.find((updated) => updated.id === task.id) ?? task,
    )
    assertUniqueTaskDates(reconciled)
    await db.planTasks.bulkPut(updatedTasks)
    return sortByStepIndex(reconciled)
  })
}

export async function deletePlanTaskGroup(
  db: VeloDB,
  groupId: string,
): Promise<{ deletedTaskCount: number }> {
  return db.transaction("rw", db.planTaskGroups, db.planTasks, async () => {
    const group = await db.planTaskGroups.get(groupId)
    if (!group) throw new Error("Plan task group not found")

    const taskIds = await db.planTasks.where("groupId").equals(groupId).primaryKeys()
    await db.planTasks.bulkDelete(taskIds)
    await db.planTaskGroups.delete(groupId)
    return { deletedTaskCount: taskIds.length }
  })
}

async function createTaskFromStep(
  db: VeloDB,
  groupId: string,
  input: CreatePlanTaskGroupInput,
  step: PlanTaskStepInput,
  now: number,
): Promise<PlanTask> {
  return {
    id: crypto.randomUUID(),
    title: step.title,
    scheduledDate: step.scheduledDate,
    subject: input.subject,
    estimatedMinutes: input.estimatedMinutes,
    notes: input.notes,
    isCompleted: 0,
    completedAt: undefined,
    groupId,
    stepIndex: step.stepIndex,
    stepTitleMode: step.stepTitleMode,
    order: await getNextTaskOrder(db, step.scheduledDate, undefined),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeAndValidateInput(input: CreatePlanTaskGroupInput): CreatePlanTaskGroupInput {
  const normalized: CreatePlanTaskGroupInput = {
    ...input,
    title: input.title.trim(),
    subject: normalizeText(input.subject),
    notes: normalizeText(input.notes),
    steps: input.steps.map((step) => ({ ...step, title: step.title.trim() })),
  }

  if (!normalized.title) throw new Error("任务名称不能为空")
  assertValidDate(normalized.startDate)
  assertValidDate(normalized.endDate)
  if (normalized.startDate > normalized.endDate) throw new Error("开始日期不能晚于截止日期")
  if (!Number.isInteger(normalized.sessionCount) || normalized.sessionCount < 1) {
    throw new Error("学习次数必须是正整数")
  }
  if (
    normalized.estimatedMinutes !== undefined &&
    (!Number.isInteger(normalized.estimatedMinutes) || normalized.estimatedMinutes <= 0)
  ) {
    throw new Error("预计时长必须是正整数")
  }
  if (normalized.steps.length !== normalized.sessionCount) {
    throw new Error("学习次数必须与步骤数量一致")
  }

  const dates = new Set<string>()
  normalized.steps.forEach((step, index) => {
    assertValidDate(step.scheduledDate)
    if (step.scheduledDate < normalized.startDate || step.scheduledDate > normalized.endDate) {
      throw new Error("步骤日期必须在任务周期内")
    }
    if (dates.has(step.scheduledDate)) throw new Error("同一任务组每天最多安排一次学习")
    dates.add(step.scheduledDate)
    if (step.stepIndex !== index + 1) throw new Error("步骤序号必须从 1 连续排列")
    if (!step.title) throw new Error("步骤名称不能为空")
    if (step.stepTitleMode !== "inherit" && step.stepTitleMode !== "custom") {
      throw new Error("步骤标题模式无效")
    }
  })

  return normalized
}

function normalizeText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

function assertValidDate(value: string) {
  try {
    parseLocalDate(value)
  } catch {
    throw new Error("任务日期无效")
  }
}

function assertConfirmedRemovals(tasks: PlanTask[], confirmedIds: string[] | undefined) {
  if (tasks.length === 0) return
  const confirmed = new Set(confirmedIds ?? [])
  if (confirmed.size !== tasks.length || tasks.some((task) => !confirmed.has(task.id))) {
    throw new Error("减少学习次数需要确认删除步骤")
  }
}

function assertUniqueTaskDates(tasks: PlanTask[]) {
  const dates = new Set<string>()
  for (const task of tasks) {
    if (dates.has(task.scheduledDate)) throw new Error("同一任务组每天最多安排一次学习")
    dates.add(task.scheduledDate)
  }
}

function sortByStepIndex(tasks: PlanTask[]) {
  return [...tasks].sort(
    (left, right) =>
      (left.stepIndex ?? Number.MAX_SAFE_INTEGER) - (right.stepIndex ?? Number.MAX_SAFE_INTEGER),
  )
}
