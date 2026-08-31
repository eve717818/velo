import type { CSSProperties } from "react"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import { getTaskGroupProgress, getTaskGroupStepState } from "@/features/plans/domain/task-group-status"
import { clampDateToRange, parseLocalDate } from "@/features/plans/domain/plan-dates"

import styles from "./TaskGroupBand.module.css"

interface TaskGroupBandProps {
  group: PlanTaskGroup
  onOpen?: (group: PlanTaskGroup, trigger: HTMLButtonElement) => void
  rangeEnd: string
  rangeStart: string
  showProgress?: boolean
  tasks: PlanTask[]
  today: string
  variant: "week" | "month"
}

function dayOffset(startDate: string, endDate: string) {
  return Math.round((parseLocalDate(endDate).getTime() - parseLocalDate(startDate).getTime()) / 86_400_000)
}

function formatDatePart(value: string, includeYear: boolean) {
  const date = parseLocalDate(value)
  return `${includeYear ? `${date.getFullYear()}年` : ""}${date.getMonth() + 1}月${date.getDate()}日`
}

function formatRange(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  const sameYear = start.getFullYear() === end.getFullYear()
  return `${formatDatePart(startDate, !sameYear)}至${formatDatePart(endDate, !sameYear)}`
}

export function TaskGroupBand({ group, onOpen, rangeEnd, rangeStart, showProgress = true, tasks, today, variant }: TaskGroupBandProps) {
  const clippedStart = clampDateToRange(group.startDate, rangeStart, rangeEnd)
  const clippedEnd = clampDateToRange(group.endDate, rangeStart, rangeEnd)
  const startColumn = dayOffset(rangeStart, clippedStart) + 1
  const span = dayOffset(clippedStart, clippedEnd) + 1
  const groupTasks = tasks
    .filter((task) => task.groupId === group.id)
    .sort((left, right) => (left.stepIndex ?? 0) - (right.stepIndex ?? 0))
  const visibleTasks = variant === "week"
    ? groupTasks
    : groupTasks.filter((task) => task.scheduledDate >= rangeStart && task.scheduledDate <= rangeEnd)
  const progress = getTaskGroupProgress(group.id, tasks)
  const accessibleProgress = `${progress.completed}/${progress.total || group.sessionCount}`
  const style = {
    gridColumn: `${startColumn} / span ${span}`,
  } as CSSProperties

  return (
    <button
      aria-label={`${group.title}，${formatRange(group.startDate, group.endDate)}，完成 ${accessibleProgress}`}
      className={`${styles.band} ${styles[variant]}`}
      data-continuation-end={group.endDate > rangeEnd ? "true" : undefined}
      data-continuation-start={group.startDate < rangeStart ? "true" : undefined}
      data-testid={`${variant}-task-group-segment`}
      onClick={(event) => onOpen?.(group, event.currentTarget)}
      style={style}
      type="button"
    >
      <span className={styles.bandCopy}>
        <strong>{group.title}</strong>
        {showProgress ? <span className={styles.progress}>{accessibleProgress}</span> : null}
      </span>
      <span aria-hidden="true" className={styles.track}>
        {visibleTasks.map((task) => {
          const fullRangeDays = Math.max(1, dayOffset(group.startDate, group.endDate))
          const offset = dayOffset(group.startDate, task.scheduledDate)
          return (
            <span
              className={styles.stepNode}
              data-state={getTaskGroupStepState(task, today)}
              data-testid="task-group-step-node"
              key={task.id}
              style={{ left: `${Math.max(0, Math.min(100, (offset / fullRangeDays) * 100))}%` }}
            />
          )
        })}
      </span>
    </button>
  )
}
