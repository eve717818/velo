import type { PlanTask, PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { isOverdue } from "@/features/plans/domain/plan-dates"

import { TaskBar, type TaskPosition } from "./TaskBar"
import styles from "../PlansPage.module.css"

interface DayPlanViewProps {
  db: VeloDB
  onCreate?: () => void
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
  taskGroups?: PlanTaskGroup[]
  tasks: PlanTask[]
  today?: string
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

function sortTasks(tasks: PlanTask[]) {
  return [...tasks].sort((left, right) => left.order - right.order)
}

export function DayPlanView({ db, onCreate, onMoved, onOpen, selectedDate, taskGroups = [], tasks, today = selectedDate }: DayPlanViewProps) {
  const timedTasks = tasks
    .filter((task) => task.startMinutes !== undefined)
    .sort((left, right) => left.startMinutes! - right.startMinutes! || left.order - right.order)
  const untimedTasks = sortTasks(tasks.filter((task) => task.startMinutes === undefined))
  const groupById = new Map(taskGroups.map((group) => [group.id, group]))
  const groupLabel = (task: PlanTask) => {
    const group = task.groupId ? groupById.get(task.groupId) : undefined
    return group && task.stepIndex ? `第 ${task.stepIndex}/${group.sessionCount} 次` : undefined
  }

  if (tasks.length === 0) {
    return (
      <section className={styles.viewEmptyState}>
        <div>
          <h3>今天还没有安排</h3>
          <p>从一件清晰、可完成的小事开始。</p>
        </div>
        <button className={styles.emptyCreateAction} onClick={onCreate} type="button">新建任务</button>
      </section>
    )
  }

  return (
    <div className={styles.dayPlan}>
      <section aria-label="定时任务" className={styles.dayLane}>
        <div className={styles.laneHeading}>
          <h3>定时安排</h3>
          <span>{timedTasks.length} 项</span>
        </div>
        <ul className={styles.timedTaskList}>
          {timedTasks.map((task) => (
            <li data-drop-date={selectedDate} data-start-minutes={task.startMinutes} key={task.id}>
              <time className={styles.timeLabel} dateTime={`${selectedDate}T${formatTime(task.startMinutes!)}`}>{formatTime(task.startMinutes!)}</time>
              <div className={styles.taskBarWithStatus}>
                <TaskBar db={db} groupLabel={groupLabel(task)} onMoved={onMoved} onOpen={onOpen} task={task} />
                {isOverdue(task, today) ? <span className={styles.overdueLabel}>已逾期</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="待安排任务" className={styles.dayLane} data-drop-date={selectedDate} data-testid="current-plan-drop-zone">
        <div className={styles.laneHeading}>
          <h3>待安排</h3>
          <span>{untimedTasks.length} 项</span>
        </div>
        {untimedTasks.length ? (
          <ul className={styles.untimedTaskList}>
            {untimedTasks.map((task) => (
              <li key={task.id}>
                <div className={styles.taskBarWithStatus}>
                  <TaskBar db={db} groupLabel={groupLabel(task)} onMoved={onMoved} onOpen={onOpen} task={task} />
                  {isOverdue(task, today) ? <span className={styles.overdueLabel}>已逾期</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={styles.emptyLaneCopy}>暂时没有待安排任务。</p>}
      </section>
    </div>
  )
}
