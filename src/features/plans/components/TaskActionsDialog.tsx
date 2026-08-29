import type { PlanTask } from "@/db/types"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"

interface TaskActionsDialogProps {
  onClose: () => void
  onDelete: () => void
  onEdit: () => void
  onMove: () => void
  onStartFocus: () => void
  open: boolean
  task: PlanTask
}

export function TaskActionsDialog({ onClose, onDelete, onEdit, onMove, onStartFocus, open, task }: TaskActionsDialogProps) {
  const headingId = "task-actions-heading"

  return (
    <PlanDialog labelledBy={headingId} onRequestClose={onClose} open={open}>
      <div className={styles.actionDialog}>
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>任务操作</p>
            <h2 id={headingId}>{task.title}</h2>
          </div>
          <button aria-label="关闭任务操作" className={styles.iconButton} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.actionList}>
          <button onClick={onEdit} type="button">编辑</button>
          <button onClick={onStartFocus} type="button">开始专注</button>
          <button onClick={onMove} type="button">移动到日期/时间</button>
          <button className={styles.dangerButton} onClick={onDelete} type="button">删除</button>
        </div>
      </div>
    </PlanDialog>
  )
}
