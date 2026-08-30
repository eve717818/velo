import { useState } from "react"

import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getMonthGridDates, getProgress, parseLocalDate } from "@/features/plans/domain/plan-dates"

import { TaskBar, type TaskPosition } from "./TaskBar"
import styles from "../PlansPage.module.css"

interface MonthPlanViewProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
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

export function MonthPlanView({ db, onMoved, onOpen, selectedDate, tasks }: MonthPlanViewProps) {
  const [selection, setSelection] = useState({ date: selectedDate, sourceDate: selectedDate })
  const activeDate = selection.sourceDate === selectedDate ? selection.date : selectedDate
  const dates = getMonthGridDates(selectedDate)
  const selectedMonth = parseLocalDate(selectedDate).getMonth()
  const activeTasks = sortTasks(tasks.filter((task) => task.scheduledDate === activeDate))

  return (
    <div className={styles.monthPlan}>
      <div aria-hidden="true" className={styles.monthWeekdays}>{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div aria-label="月度日历" className={styles.monthGrid}>
        {dates.map((date) => {
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
              onClick={() => setSelection({ date, sourceDate: selectedDate })}
              type="button"
            >
              <span className={styles.monthDateNumber}>{value.getDate()}</span>
              <span className={styles.monthCounts}>{progress.total}/{progress.completed}</span>
            </button>
          )
        })}
      </div>
      <section aria-label={`${dateLabel(activeDate)}任务`} className={styles.monthTaskPanel}>
        <div className={styles.weekListHeading}>
          <h3>{dateLabel(activeDate)} · {weekdayNames[parseLocalDate(activeDate).getDay()]}</h3>
          <span>{activeTasks.length} 项任务</span>
        </div>
        {activeTasks.length ? (
          <ul className={styles.untimedTaskList}>
            {activeTasks.map((task) => <li key={task.id}><TaskBar db={db} onMoved={onMoved} onOpen={onOpen} task={task} /></li>)}
          </ul>
        ) : <p className={styles.emptyLaneCopy}>当天还没有任务。</p>}
      </section>
    </div>
  )
}
