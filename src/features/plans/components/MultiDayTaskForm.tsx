import type { ReactNode } from "react"

import type { PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import type { RequestSession } from "./useRequestSession"

interface MultiDayTaskFormProps {
  db: VeloDB
  initialDate: string
  modeSwitch?: ReactNode
  onClose: () => void
  requestSession: RequestSession
  taskGroup?: PlanTaskGroup
}

/** Legacy rollback surface; cross-day tasks are no longer available. */
export function MultiDayTaskForm({ db: _db, initialDate: _initialDate, modeSwitch, onClose, requestSession: _requestSession, taskGroup: _taskGroup }: MultiDayTaskFormProps) {
  void [_db, _initialDate, _requestSession, _taskGroup]
  return (
    <section aria-label="跨日任务已停用">
      {modeSwitch}
      <h2>跨日任务已停用</h2>
      <p>请使用当前计划周期内的单个任务。</p>
      <button onClick={onClose} type="button">返回单日任务</button>
    </section>
  )
}
