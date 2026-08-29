import { useState } from "react"

import type { LegacyPlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { LegacyPlanDateError, convertLegacyPlanTask } from "../data/legacy-plan-task-service"
import styles from "../PlansPage.module.css"

interface LegacyPlanMigrationPanelProps { db: VeloDB; legacyTasks: LegacyPlanTask[]; open: boolean }

export function LegacyPlanMigrationPanel({ db, legacyTasks, open }: LegacyPlanMigrationPanelProps) {
  const [dates, setDates] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  if (!open || legacyTasks.length === 0) return null

  async function convert(task: LegacyPlanTask) {
    try {
      await convertLegacyPlanTask(db, task.id, dates[task.id] ?? "", Date.now())
      setErrors((current) => ({ ...current, [task.id]: "" }))
    } catch (error) {
      setErrors((current) => ({ ...current, [task.id]: error instanceof LegacyPlanDateError ? error.message : error instanceof Error ? error.message : "转换失败，请重试" }))
    }
  }

  return <aside aria-label="旧计划任务修复" className={styles.legacyMigrationPanel}><p className={styles.metaLabel}>旧数据修复</p><h3>请为旧计划任务选择真实日期</h3>{legacyTasks.map((task) => <section className={styles.legacyRow} key={task.id}><strong>{task.title}</strong><label>安排日期<input aria-label="安排日期" onChange={(event) => setDates((current) => ({ ...current, [task.id]: event.target.value }))} type="date" value={dates[task.id] ?? ""} /></label>{errors[task.id] ? <small role="alert">{errors[task.id]}</small> : null}<button className={styles.emptyCreateAction} onClick={() => { void convert(task) }} type="button">转换为学习任务</button></section>)}</aside>
}
