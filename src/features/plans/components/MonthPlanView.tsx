import { useState } from "react"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getMonthGridDates, getProgress, parseLocalDate } from "@/features/plans/domain/plan-dates"

import { TaskBar, type TaskPosition } from "./TaskBar"
import styles from "../PlansPage.module.css"

interface MonthPlanViewProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
  taskGroups?: PlanTaskGroup[]
  tasks: PlanTask[]
}

const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]

function dateLabel(date: string) {
  const value = parseLocalDate(date)
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`
}

function sortTasks(tasks: PlanTask[]) {
  return [...tasks].sort((left, right) => (left.startMinutes ?? Number.MAX_SAFE_INTEGER) - (right.startMinutes ?? Number.MAX_SAFE_INTEGER) || left.order - right.order)
}

export function MonthPlanView({ tasks, db, onMoved, onOpen, selectedDate, taskGroups = [] }: MonthPlanViewProps) {
  const [selection, setSelection] = useState({ date: selectedDate, sourceDate: selectedDate })
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const activeDate = selection.sourceDate === selectedDate ? selection.date : selectedDate
  const dates = getMonthGridDates(selectedDate)
  const weeks = Array.from({ length: dates.length / 7 }, (_, index) => dates.slice(index * 7, index * 7 + 7))
  const selectedMonth = parseLocalDate(selectedDate).getMonth()
  const activeTasks = sortTasks(tasks.filter((task) => task.scheduledDate === activeDate))
  const isExpanded = expandedDate === activeDate
  const visibleTasks = isExpanded ? activeTasks : activeTasks.slice(0, 2)
  const groupById = new Map(taskGroups.map((group) => [group.id, group]))
  const groupLabel = (task: PlanTask) => {
    const group = task.groupId ? groupById.get(task.groupId) : undefined
    return group && task.stepIndex ? `第 ${task.stepIndex}/${group.sessionCount} 次` : undefined
  }

  return (
    <div className={styles.monthPlan}>
      <div aria-hidden="true" className={styles.monthWeekdays}>{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div aria-label="月度日历" className={styles.monthGrid}>
        {weeks.map((weekDates) => (
          <div className={styles.monthWeekRow} key={weekDates[0]}>
            <div className={styles.monthWeekDays}>
              {weekDates.map((date) => {
                const progress = getProgress(tasks.filter((task) => task.scheduledDate === date))
                const value = parseLocalDate(date)
                const label = `${dateLabel(date)}，${progress.total} 项任务，${progress.completed} 项完成`
                return (
                  <button
                    aria-label={label}
                    aria-pressed={date === activeDate}
                    className={`${styles.monthDay} ${value.getMonth() === selectedMonth ? "" : styles.outsideMonth}`}
                    data-drop-date={date}
                    key={date}
                    onClick={() => { setSelection({ date, sourceDate: selectedDate }); setExpandedDate(null) }}
                    type="button"
                  >
                    <span className={styles.monthDateNumber}>{value.getDate()}</span>
                    <span className={styles.monthCounts}>{progress.total}/{progress.completed}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <section aria-label={`${dateLabel(activeDate)}任务`} className={styles.monthTaskPanel}>
        <div className={styles.weekListHeading}>
          <h3>{dateLabel(activeDate)} · {weekdayNames[parseLocalDate(activeDate).getDay()]}</h3>
          <span>{activeTasks.length} 项任务</span>
        </div>
        {activeTasks.length ? (
          <ul className={styles.untimedTaskList}>
            {visibleTasks.map((task) => <li key={task.id}><TaskBar db={db} groupLabel={groupLabel(task)} onMoved={onMoved} onOpen={onOpen} task={task} /></li>)}
          </ul>
        ) : <p className={styles.emptyLaneCopy}>当天还没有任务。</p>}
        {activeTasks.length > 2 ? (
          <button
            aria-expanded={isExpanded}
            className={styles.monthTaskToggle}
            onClick={() => setExpandedDate(isExpanded ? null : activeDate)}
            type="button"
          >
            {isExpanded ? "收起任务列表" : `展开另外 ${activeTasks.length - 2} 项任务`}
          </button>
        ) : null}
      </section>
    </div>
  )
}
