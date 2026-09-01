import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { TaskBar, type TaskPosition } from "./TaskBar"

interface WeekPlanViewProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
  tasks: PlanTask[]
}

/** Legacy rollback surface; active routes use PlanTaskListView. */
export function WeekPlanView({ db, onMoved, onOpen, selectedDate, tasks }: WeekPlanViewProps) {
  return (
    <section aria-label="周计划兼容视图" data-period-key={selectedDate}>
      <ul>
        {[...tasks].sort((left, right) => left.order - right.order).map((task) => (
          <li key={task.id}><TaskBar db={db} onMoved={onMoved} onOpen={onOpen} task={task} /></li>
        ))}
      </ul>
    </section>
  )
}
