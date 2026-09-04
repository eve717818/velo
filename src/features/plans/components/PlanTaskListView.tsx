import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { TaskBar, type TaskPosition } from "./TaskBar"
import styles from "../PlansPage.module.css"

export interface PlanTaskListViewProps {
  db: VeloDB
  scope: Exclude<PlanTask["scope"], "day">
  periodKey: string
  tasks: PlanTask[]
  onCreate: () => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
}

const scopeCopy = {
  week: { region: "本周任务", empty: "本周还没有任务。" },
  month: { region: "本月任务", empty: "本月还没有任务。" },
  semester: { region: "本学期任务", empty: "当前学期或假期还没有任务。" },
} as const

export function PlanTaskListView({ db, onCreate, onMoved, onOpen, periodKey, scope, tasks }: PlanTaskListViewProps) {
  const copy = scopeCopy[scope]
  const orderedTasks = [...tasks].sort((left, right) => left.order - right.order)

  return (
    <section aria-label={copy.region} className={styles.planListSurface} data-period-key={periodKey}>
      {orderedTasks.length === 0 ? (
        <div className={styles.viewEmptyState}>
          <div>
            <h3>还没有任务</h3>
            <p>{copy.empty}</p>
          </div>
          <button className={styles.emptyCreateAction} onClick={onCreate} type="button">新建任务</button>
        </div>
      ) : (
        <ul>
          {orderedTasks.map((task) => (
            <li key={task.id}>
              <TaskBar db={db} onMoved={onMoved} onOpen={onOpen} task={task} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
