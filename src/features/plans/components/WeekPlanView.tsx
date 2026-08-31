import { useState } from "react"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getWeekDates, parseLocalDate } from "@/features/plans/domain/plan-dates"
import { groupOverlapsRange } from "@/features/plans/domain/task-group-status"

import { TaskBar, type TaskPosition } from "./TaskBar"
import { TaskGroupBand } from "./TaskGroupBand"
import styles from "../PlansPage.module.css"

interface WeekPlanViewProps {
  allTasks?: PlanTask[]
  db: VeloDB
  onOpenGroup?: (group: PlanTaskGroup, trigger: HTMLButtonElement) => void
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
  taskGroups?: PlanTaskGroup[]
  tasks: PlanTask[]
  today?: string
}

const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]

function formatDateLabel(date: string) {
  const value = parseLocalDate(date)
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日，${weekdayNames[value.getDay()]}`
}

function sortTasks(tasks: PlanTask[]) {
  return [...tasks].sort((left, right) => (left.startMinutes ?? Number.MAX_SAFE_INTEGER) - (right.startMinutes ?? Number.MAX_SAFE_INTEGER) || left.order - right.order)
}

export function WeekPlanView({ tasks, allTasks = tasks, db, onMoved, onOpen, onOpenGroup, selectedDate, taskGroups = [], today = selectedDate }: WeekPlanViewProps) {
  const dates = getWeekDates(selectedDate)
  const rangeStart = dates[0]
  const rangeEnd = dates[dates.length - 1]
  const [selection, setSelection] = useState({ date: selectedDate, sourceDate: selectedDate })
  const activeDate = selection.sourceDate === selectedDate ? selection.date : selectedDate
  const tasksForDate = (date: string) => sortTasks(tasks.filter((task) => task.scheduledDate === date))
  const visibleGroups = taskGroups.filter((group) => groupOverlapsRange(group, rangeStart, rangeEnd))
  const groupById = new Map(taskGroups.map((group) => [group.id, group]))
  const groupLabel = (task: PlanTask) => {
    const group = task.groupId ? groupById.get(task.groupId) : undefined
    return group && task.stepIndex ? `第 ${task.stepIndex}/${group.sessionCount} 次` : undefined
  }

  return (
    <div className={styles.weekPlan}>
      <div aria-label="选择周内日期" className={styles.weekDateStrip} role="group">
        {dates.map((date) => (
          <button
            aria-label={formatDateLabel(date)}
            aria-pressed={date === activeDate}
            className={styles.weekDateButton}
            key={date}
            onClick={() => setSelection({ date, sourceDate: selectedDate })}
            type="button"
          >
            <span>{parseLocalDate(date).getDate()}</span>
            <small>{weekdayNames[parseLocalDate(date).getDay()].replace("星期", "周")}</small>
            <span className={styles.srOnly}>{formatDateLabel(date)}</span>
          </button>
        ))}
      </div>
      {visibleGroups.length ? (
        <div aria-label="本周跨日任务" className={styles.weekGroupScroller} role="region">
          <div className={styles.weekGroupBands}>
            {visibleGroups.map((group) => (
              <TaskGroupBand
                group={group}
                key={group.id}
                onOpen={onOpenGroup}
                rangeEnd={rangeEnd}
                rangeStart={rangeStart}
                tasks={allTasks}
                today={today}
                variant="week"
              />
            ))}
          </div>
        </div>
      ) : null}
      <section aria-label={`${formatDateLabel(activeDate)}任务`} className={styles.weekMobileList}>
        <div className={styles.weekListHeading}>
          <h3>{formatDateLabel(activeDate)}</h3>
          <span>{tasksForDate(activeDate).length} 项任务</span>
        </div>
        {tasksForDate(activeDate).length ? (
          <ul className={styles.untimedTaskList}>
            {tasksForDate(activeDate).map((task) => <li key={task.id}><TaskBar db={db} groupLabel={groupLabel(task)} onMoved={onMoved} onOpen={onOpen} task={task} /></li>)}
          </ul>
        ) : <p className={styles.emptyLaneCopy}>当天还没有任务。</p>}
      </section>
      <div aria-label="本周排程" className={styles.weekGrid}>
        {dates.map((date) => (
          <section className={styles.weekDayColumn} data-drop-date={date} key={date}>
            <header>
              <span>{weekdayNames[parseLocalDate(date).getDay()].replace("星期", "周")}</span>
              <strong>{parseLocalDate(date).getDate()}</strong>
            </header>
            <ul>
              {tasksForDate(date).map((task) => <li key={task.id}><TaskBar db={db} groupLabel={groupLabel(task)} onMoved={onMoved} onOpen={onOpen} task={task} /></li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
