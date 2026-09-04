import type { PlanTask } from "@/db/types"
import { buildFocusHref } from "../focus-link"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"

interface TaskActionsDialogProps {
  onClose: () => void
  onDelete: () => void
  onEdit: () => void
  onMove: () => void
  onStartFocus: (href: string) => void
  onToggleCompletion: (nextValue: boolean) => void
  onRetryCompletion?: () => void
  completionError?: string
  completionSaving?: boolean
  open: boolean
  returnFocusTo?: HTMLElement | null
  task: PlanTask
}

export function TaskActionsDialog({ completionError, completionSaving, onClose, onDelete, onEdit, onMove, onRetryCompletion, onStartFocus, onToggleCompletion, open, returnFocusTo, task }: TaskActionsDialogProps) {
  const headingId = "task-actions-heading"

  return (
    <PlanDialog labelledBy={headingId} onRequestClose={onClose} open={open} returnFocusTo={returnFocusTo}>
      <div className={styles.actionDialog}>
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>任务操作</p>
            <h2 id={headingId}>{task.title}</h2>
          </div>
          <button aria-label="关闭任务操作" className={styles.iconButton} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.actionList}>
          <button disabled={completionSaving} onClick={() => onToggleCompletion(task.isCompleted !== 1)} type="button">{task.isCompleted === 1 ? "恢复为未完成" : "标记为完成"}</button>
          <button onClick={onEdit} type="button">编辑</button>
          <button onClick={() => onStartFocus(buildFocusHref(task))} type="button">开始专注</button>
          <button onClick={onMove} type="button">移动到日期/时间</button>
          <button className={styles.dangerButton} onClick={onDelete} type="button">删除</button>
        </div>
        {completionError && onRetryCompletion ? <PlanErrorState error={completionError} onRetry={onRetryCompletion} /> : null}
      </div>
    </PlanDialog>
  )
}
