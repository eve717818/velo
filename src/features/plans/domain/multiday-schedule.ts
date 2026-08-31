import type { PlanTask, PlanTaskGroup } from "../../../db/types"
import { addLocalDays, parseLocalDate } from "./plan-dates"

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

interface DateLoad {
  minutes: number
  count: number
}

const defaultTaskMinutes = 30

export function buildMultiDaySchedule(
  request: ScheduleRequest,
  existingTasks: PlanTask[],
): ScheduledStepDraft[] {
  const dates = validateAndEnumerateRange(request.startDate, request.endDate)
  if (!Number.isInteger(request.sessionCount) || request.sessionCount < 1 || request.sessionCount > dates.length) {
    throw new Error("学习次数必须是日期范围内的正整数")
  }

  if (request.estimatedMinutes !== undefined && request.estimatedMinutes <= 0) {
    throw new Error("单次预计时长必须大于零")
  }

  if (request.sessionCount === 1) {
    return [{ scheduledDate: request.endDate, stepIndex: 1 }]
  }

  const loads = dailyLoad(existingTasks)
  const targetIndices = Array.from({ length: request.sessionCount }, (_, index) =>
    Math.round((index * (dates.length - 1)) / (request.sessionCount - 1)),
  )

  return targetIndices.map((targetIndex, index) => {
    if (index === targetIndices.length - 1) {
      return { scheduledDate: request.endDate, stepIndex: index + 1 }
    }

    const windowStart =
      index === 0 ? 0 : Math.floor((targetIndices[index - 1] + targetIndex) / 2) + 1
    const windowEnd = Math.floor((targetIndex + targetIndices[index + 1]) / 2)
    const scheduledDate = dates
      .slice(windowStart, windowEnd + 1)
      .sort((left, right) => compareDateCandidates(left, right, loads, dates[targetIndex]))[0]

    return { scheduledDate, stepIndex: index + 1 }
  })
}

export function buildOverdueRescheduleProposal(
  group: PlanTaskGroup,
  groupTasks: PlanTask[],
  allTasks: PlanTask[],
  today: string,
): RescheduleProposal[] {
  validateAndEnumerateRange(group.startDate, group.endDate)
  parseLocalDate(today)

  const overdueTasks = groupTasks
    .filter((task) => task.isCompleted === 0 && task.scheduledDate < today)
    .sort(compareGroupSteps)

  if (overdueTasks.length === 0) {
    return []
  }

  const overdueIds = new Set(overdueTasks.map((task) => task.id))
  const occupiedDates = new Set(
    groupTasks.filter((task) => !overdueIds.has(task.id)).map((task) => task.scheduledDate),
  )
  const firstCandidate = today < group.startDate ? group.startDate : today
  const candidateDates =
    firstCandidate > group.endDate
      ? []
      : enumerateDates(firstCandidate, group.endDate).filter((date) => !occupiedDates.has(date))

  if (candidateDates.length < overdueTasks.length) {
    throw new Error("截止日前没有足够日期重新安排剩余学习")
  }

  const loads = dailyLoad(allTasks.filter((task) => !overdueIds.has(task.id)))
  const selectedDates = candidateDates
    .sort((left, right) => compareDateCandidates(left, right, loads))
    .slice(0, overdueTasks.length)
    .sort()

  return overdueTasks.map((task, index) => ({
    taskId: task.id,
    previousDate: task.scheduledDate,
    scheduledDate: selectedDates[index],
  }))
}

function validateAndEnumerateRange(startDate: string, endDate: string): string[] {
  parseLocalDate(startDate)
  parseLocalDate(endDate)
  if (startDate > endDate) {
    throw new Error("开始日期不能晚于截止日期")
  }
  return enumerateDates(startDate, endDate)
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

function taskLoadMinutes(task: Pick<PlanTask, "estimatedMinutes">) {
  return task.estimatedMinutes ?? defaultTaskMinutes
}

function dailyLoad(tasks: PlanTask[]) {
  const result = new Map<string, DateLoad>()
  for (const task of tasks) {
    const current = result.get(task.scheduledDate) ?? { minutes: 0, count: 0 }
    result.set(task.scheduledDate, {
      minutes: current.minutes + taskLoadMinutes(task),
      count: current.count + 1,
    })
  }
  return result
}

function compareDateCandidates(
  left: string,
  right: string,
  loads: Map<string, DateLoad>,
  targetDate?: string,
) {
  const leftLoad = loads.get(left) ?? { minutes: 0, count: 0 }
  const rightLoad = loads.get(right) ?? { minutes: 0, count: 0 }
  return (
    leftLoad.minutes - rightLoad.minutes ||
    leftLoad.count - rightLoad.count ||
    distanceFromTarget(left, targetDate) - distanceFromTarget(right, targetDate) ||
    left.localeCompare(right)
  )
}

function distanceFromTarget(date: string, targetDate?: string) {
  if (!targetDate) return 0
  return Math.abs(parseLocalDate(date).getTime() - parseLocalDate(targetDate).getTime())
}

function compareGroupSteps(left: PlanTask, right: PlanTask) {
  return (
    (left.stepIndex ?? Number.MAX_SAFE_INTEGER) - (right.stepIndex ?? Number.MAX_SAFE_INTEGER) ||
    left.scheduledDate.localeCompare(right.scheduledDate) ||
    left.id.localeCompare(right.id)
  )
}
