import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { TaskBar, type TaskPosition } from "./TaskBar"

interface MonthPlanViewProps {
  db: VeloDB
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  selectedDate: string
  tasks: PlanTask[]
}

/** Legacy rollback surface; active routes use PlanTaskListView. */
export function MonthPlanView({ db, onMoved, onOpen, selectedDate, tasks }: MonthPlanViewProps) {
  return (
    <section aria-label="月计划兼容视图" data-period-key={selectedDate.slice(0, 7)}>
      <ul>
        {[...tasks].sort((left, right) => left.order - right.order).map((task) => (
          <li key={task.id}><TaskBar db={db} onMoved={onMoved} onOpen={onOpen} task={task} /></li>
        ))}
      </ul>
    </section>
  )
}
