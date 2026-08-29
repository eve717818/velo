import type { CSSProperties } from "react"

import type { PlanTask } from "@/db/types"

import styles from "./TaskBar.module.css"

interface TaskDragLayerProps {
  task: PlanTask
  x: number
  y: number
}

export function TaskDragLayer({ task, x, y }: TaskDragLayerProps) {
  const style = { transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)` } as CSSProperties

  return (
    <div aria-hidden="true" className={styles.dragLayer} data-testid="task-drag-layer" style={style}>
      {task.title}
    </div>
  )
}
