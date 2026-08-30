import { useRef, useState } from "react"
import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { deletePlanTask } from "../data/plan-task-service"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"
import { useRequestSession } from "./useRequestSession"

interface DeleteTaskDialogProps {
  db: VeloDB
  onClose: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
  task: PlanTask
}

export function DeleteTaskDialog({ db, onClose, open, returnFocusTo, task }: DeleteTaskDialogProps) {
  const sessionKey = `${open}-${task.id}-${task.updatedAt}`

  return (
    <PlanDialog labelledBy="delete-task-heading" onRequestClose={onClose} open={open} returnFocusTo={returnFocusTo}>
      <DeleteTaskDialogSession db={db} key={sessionKey} onClose={onClose} task={task} />
    </PlanDialog>
  )
}

function DeleteTaskDialogSession({ db, onClose, task }: Pick<DeleteTaskDialogProps, "db" | "onClose" | "task">) {
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const lastTaskIdRef = useRef<string | null>(null)
  const requestSession = useRequestSession()

  function requestClose() {
    requestSession.invalidate()
    onClose()
  }

  async function confirmDelete(retryTaskId?: string) {
    const taskId = retryTaskId ?? task.id
    const requestToken = requestSession.beginRequest()
    lastTaskIdRef.current = taskId
    setIsDeleting(true)
    setError("")
    try {
      await deletePlanTask(db, taskId)
      if (!requestSession.isCurrent(requestToken)) return
      requestClose()
    } catch (caught) {
      if (!requestSession.isCurrent(requestToken)) return
      setError(caught instanceof Error ? caught.message : "删除任务失败，请重试")
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsDeleting(false)
    }
  }

  return (
    <div aria-busy={isDeleting} className={styles.confirmationDialog}>
      <p className={styles.eyebrow}>删除任务</p>
      <h2 id="delete-task-heading">确定删除“{task.title}”吗？</h2>
      <p>删除后无法恢复这项任务。</p>
      <div className={styles.actions}>
        {error ? <PlanErrorState error={error} onRetry={() => { if (lastTaskIdRef.current) void confirmDelete(lastTaskIdRef.current) }} /> : null}
        <button className={styles.secondaryButton} onClick={requestClose} type="button">取消</button>
        <button className={styles.dangerButton} disabled={isDeleting} onClick={() => { void confirmDelete() }} type="button">
          {isDeleting ? "正在删除" : "确认删除"}
        </button>
      </div>
    </div>
  )
}
