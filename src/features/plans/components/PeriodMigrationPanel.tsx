import { useState } from "react"

import type { LearningPeriod, PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { copyTasksToPeriod } from "../data/plan-task-service"
import { dismissPeriodMigration } from "../data/period-migration-service"
import styles from "../PlansPage.module.css"

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
  const [error, setError] = useState("")

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function copySelected() {
    if (selectedIds.length === 0) return
    setSaving(true)
    setError("")
    try {
      await copyTasksToPeriod(db, selectedIds, targetPeriod, today, Date.now())
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : "复制任务失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  async function dismiss() {
    await dismissPeriodMigration(db, sourcePeriod.id, targetPeriod.id)
    onClose()
  }

  return (
    <aside aria-label="上周期任务迁移" className={styles.periodMigrationPanel}>
      <p className={styles.metaLabel}>学习周期衔接</p>
      <h3>上一学习周期还有 {tasks.length} 个任务未完成</h3>
      <p>选择需要复制到“{targetPeriod.name}”的任务；原任务会保留不变。</p>
      <p className={styles.migrationSelection}>已选择 {selectedIds.length} 项</p>
      {error ? <p className={styles.migrationError} role="alert">{error}</p> : null}
      <ul className={styles.migrationTaskList}>{tasks.map((task) => <li key={task.id}><label><input aria-label={`选择${task.title}`} checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)} type="checkbox" /> <span>{task.title}</span></label></li>)}</ul>
      <div className={styles.migrationActions}><button className={styles.secondaryPeriodAction} onClick={() => { void dismiss() }} type="button">暂不处理</button><button className={styles.emptyCreateAction} disabled={saving || selectedIds.length === 0} onClick={() => { void copySelected() }} type="button">复制 {selectedIds.length} 项任务</button></div>
    </aside>
  )
}
