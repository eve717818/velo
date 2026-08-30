import { useRef, useState } from "react"

import type { LearningPeriod, PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { copyTasksToPeriod } from "../data/plan-task-service"
import { dismissPeriodMigration } from "../data/period-migration-service"
import styles from "../PlansPage.module.css"
import { PlanErrorState } from "./PlanErrorState"
import { useRequestSession } from "./useRequestSession"

interface PeriodMigrationPanelProps {
  db: VeloDB
  onClose: () => void
  open: boolean
  sourcePeriod: LearningPeriod
  targetPeriod: LearningPeriod
  tasks: PlanTask[]
  today: string
}

export function PeriodMigrationPanel({ db, onClose, open, sourcePeriod, targetPeriod, tasks, today }: PeriodMigrationPanelProps) {
  if (!open) return null
  return <PeriodMigrationPanelSession db={db} key={`${sourcePeriod.id}-${targetPeriod.id}`} onClose={onClose} sourcePeriod={sourcePeriod} targetPeriod={targetPeriod} tasks={tasks} today={today} />
}

function PeriodMigrationPanelSession({ db, onClose, sourcePeriod, targetPeriod, tasks, today }: Omit<PeriodMigrationPanelProps, "open">) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ action: "copy" | "dismiss"; message: string } | null>(null)
  const lastSelectedIdsRef = useRef<string[]>([])
  const requestSession = useRequestSession()

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function requestClose() {
    requestSession.invalidate()
    onClose()
  }

  async function copySelected(retryIds?: string[]) {
    const ids = retryIds ?? selectedIds
    if (ids.length === 0) return
    const requestToken = requestSession.beginRequest()
    lastSelectedIdsRef.current = [...ids]
    setSaving(true)
    setError(null)
    try {
      await copyTasksToPeriod(db, ids, targetPeriod, today, Date.now())
      if (!requestSession.isCurrent(requestToken)) return
      requestClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      setError({ action: "copy", message: error instanceof Error ? error.message : "复制任务失败，请重试" })
    } finally {
      if (requestSession.isCurrent(requestToken)) setSaving(false)
    }
  }

  async function dismiss() {
    const requestToken = requestSession.beginRequest()
    setSaving(true)
    setError(null)
    try {
      await dismissPeriodMigration(db, sourcePeriod.id, targetPeriod.id)
      if (!requestSession.isCurrent(requestToken)) return
      requestClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      setError({ action: "dismiss", message: error instanceof Error ? error.message : "暂不处理失败，请重试" })
    } finally {
      if (requestSession.isCurrent(requestToken)) setSaving(false)
    }
  }

  return (
    <aside aria-label="上周期任务迁移" className={styles.periodMigrationPanel}>
      <p className={styles.metaLabel}>学习周期衔接</p>
      <h3>上一学习周期还有 {tasks.length} 个任务未完成</h3>
      <p>选择需要复制到“{targetPeriod.name}”的任务；原任务会保留不变。</p>
      <p className={styles.migrationSelection}>已选择 {selectedIds.length} 项</p>
      <ul className={styles.migrationTaskList}>{tasks.map((task) => <li key={task.id}><label><input aria-label={`选择${task.title}`} checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)} type="checkbox" /> <span>{task.title}</span></label></li>)}</ul>
      <div className={styles.migrationActions}>
        <button className={styles.secondaryPeriodAction} disabled={saving} onClick={() => { void dismiss() }} type="button">暂不处理</button>
        {error?.action === "dismiss" ? <PlanErrorState error={error.message} onRetry={() => { void dismiss() }} /> : null}
        {error?.action === "copy" ? <PlanErrorState error={error.message} onRetry={() => { if (lastSelectedIdsRef.current.length > 0) void copySelected(lastSelectedIdsRef.current) }} /> : null}
        <button className={styles.emptyCreateAction} disabled={saving || selectedIds.length === 0} onClick={() => { void copySelected() }} type="button">复制 {selectedIds.length} 项任务</button>
      </div>
    </aside>
  )
}
