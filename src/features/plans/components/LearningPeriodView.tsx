import type { LearningPeriod, LearningPeriodKind, PlanTask } from "@/db/types"

import { findPeriodForDate } from "../domain/learning-periods"
import { getProgress } from "../domain/plan-dates"
import styles from "../PlansPage.module.css"

const kindLabels: Record<LearningPeriodKind, string> = {
  semester: "学期",
  "winter-break": "寒假",
  "summer-break": "暑假",
  "custom-break": "自定义假期",
}

interface LearningPeriodViewProps {
  onCreate?: () => void
  onEdit?: (period: LearningPeriod) => void
  onDelete?: (period: LearningPeriod) => void
  onReopenMigration?: (period: LearningPeriod) => void
  onSelect?: (period: LearningPeriod) => void
  onEditTask?: (task: PlanTask) => void
  periods: LearningPeriod[]
  selectedPeriodId?: string
  tasks: PlanTask[]
  today: string
}

function sortPeriods(periods: LearningPeriod[]) {
  return [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name))
}

export function LearningPeriodView({ onCreate, onDelete, onEdit, onEditTask, onReopenMigration, onSelect, periods, selectedPeriodId, tasks, today }: LearningPeriodViewProps) {
  const sortedPeriods = sortPeriods(periods)
  const selectedPeriod = sortedPeriods.find((period) => period.id === selectedPeriodId) ?? sortedPeriods[0]
  const selectedTasks = selectedPeriod
    ? tasks.filter((task) => task.scheduledDate >= selectedPeriod.startDate && task.scheduledDate <= selectedPeriod.endDate)
    : []
  const unassignedTasks = tasks.filter((task) => !findPeriodForDate(sortedPeriods, task.scheduledDate))
  const progress = getProgress(selectedTasks)
  const isHistorical = Boolean(selectedPeriod && selectedPeriod.endDate < today)

  if (sortedPeriods.length === 0) {
    return (
      <div className={styles.periodEmptyState}>
        <div><h3>还没有学习周期</h3><p>用学期和假期安排学习节奏。</p></div>
        <button className={styles.emptyCreateAction} onClick={onCreate} type="button">创建第一个学期或假期</button>
      </div>
    )
  }

  return (
    <div className={styles.learningPeriodView}>
      <div aria-label="学习周期列表" className={styles.periodCardList}>
        {sortedPeriods.map((period) => {
          const periodTasks = tasks.filter((task) => task.scheduledDate >= period.startDate && task.scheduledDate <= period.endDate)
          const periodProgress = getProgress(periodTasks)
          return (
            <article className={styles.periodCard} data-period-id={period.id} data-testid="learning-period-card" key={period.id}>
              <button aria-pressed={period.id === selectedPeriod?.id} className={styles.periodSelect} onClick={() => onSelect?.(period)} type="button">
                <span className={styles.periodKind}>{kindLabels[period.kind]}</span>
                <strong>{period.name}</strong>
                <span>{period.startDate} 至 {period.endDate}</span>
              </button>
              <span className={styles.periodProgress}>{periodProgress.completed} / {periodProgress.total}</span>
            </article>
          )
        })}
      </div>
      {onCreate ? <button className={styles.secondaryPeriodAction} onClick={onCreate} type="button">新建周期</button> : null}

      {selectedPeriod ? (
        <section aria-labelledby="period-overview-heading" className={styles.periodOverview}>
          <div className={styles.periodOverviewHeader}>
            <div>
              <p className={styles.metaLabel}>{kindLabels[selectedPeriod.kind]}</p>
              <h3 id="period-overview-heading">{selectedPeriod.name}</h3>
              <p>{selectedPeriod.startDate} 至 {selectedPeriod.endDate} · {progress.completed} / {progress.total} 项完成</p>
            </div>
            {!isHistorical ? <div className={styles.periodActions}>
              <button className={styles.secondaryPeriodAction} onClick={() => onEdit?.(selectedPeriod)} type="button">编辑周期</button>
              {onDelete ? <button className={styles.dangerPeriodAction} onClick={() => onDelete(selectedPeriod)} type="button">删除周期</button> : null}
              {onReopenMigration ? <button className={styles.secondaryPeriodAction} onClick={() => onReopenMigration(selectedPeriod)} type="button">处理上周期任务</button> : null}
            </div> : null}
          </div>
          {selectedPeriod.goal ? <p className={styles.periodGoal}>目标：{selectedPeriod.goal}</p> : null}
          <ul aria-label="周期任务" className={styles.periodTaskList}>
            {selectedTasks.map((task) => <li key={task.id}><button className={styles.periodTaskAction} onClick={() => onEditTask?.(task)} type="button">编辑任务：{task.title}</button></li>)}
          </ul>
        </section>
      ) : null}

      {unassignedTasks.length ? (
        <section aria-labelledby="unassigned-period-heading" className={styles.unassignedPeriodTasks}>
          <h3 id="unassigned-period-heading">未归属周期</h3>
          <ul>{unassignedTasks.map((task) => <li key={task.id}>{task.title}</li>)}</ul>
        </section>
      ) : null}
    </div>
  )
}
