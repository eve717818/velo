import { useState } from "react"
import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { deletePlanTask } from "../data/plan-task-service"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"

interface DeleteTaskDialogProps {
  db: VeloDB
  onClose: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
  task: PlanTask
}

export function DeleteTaskDialog({ db, onClose, open, returnFocusTo, task }: DeleteTaskDialogProps) {
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const headingId = "delete-task-heading"

  async function confirmDelete() {
    setIsDeleting(true)
    setError("")
    try {
      await deletePlanTask(db, task.id)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除任务失败，请重试")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <PlanDialog labelledBy={headingId} onRequestClose={onClose} open={open} returnFocusTo={returnFocusTo}>
      <div aria-busy={isDeleting} className={styles.confirmationDialog}>
        <p className={styles.eyebrow}>删除任务</p>
        <h2 id={headingId}>确定删除“{task.title}”吗？</h2>
        <p>删除后无法恢复这项任务。</p>
        {error ? <PlanErrorState error={error} onRetry={() => { void confirmDelete() }} /> : null}
        <div className={styles.actions}>
          <button className={styles.secondaryButton} onClick={onClose} type="button">取消</button>
          <button className={styles.dangerButton} disabled={isDeleting} onClick={() => { void confirmDelete() }} type="button">
            {isDeleting ? "正在删除" : "确认删除"}
          </button>
        </div>
      </div>
    </PlanDialog>
  )
}
