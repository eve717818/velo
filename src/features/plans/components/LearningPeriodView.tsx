import type { LearningPeriod, LearningPeriodKind } from "@/db/types"
import { MoreHorizontal, Plus } from "lucide-react"

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
  periods: LearningPeriod[]
  selectedPeriodId?: string
}

function sortPeriods(periods: LearningPeriod[]) {
  return [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name))
}

export function LearningPeriodView({ onCreate, onDelete, onEdit, onReopenMigration, onSelect, periods, selectedPeriodId }: LearningPeriodViewProps) {
  const sortedPeriods = sortPeriods(periods)
  const selectedPeriod = sortedPeriods.find((period) => period.id === selectedPeriodId) ?? null

  return (
    <section aria-label="学期管理" className={styles.learningPeriodView}>
      <div className={styles.periodOverviewHeader}>
        <div>
          <p className={styles.metaLabel}>学期与假期</p>
          <h3>管理学习周期</h3>
        </div>
        {onCreate ? <button className={styles.createPeriodAction} onClick={onCreate} type="button"><Plus aria-hidden size={18} />新建学期或假期</button> : null}
      </div>
      {sortedPeriods.length === 0 ? <p>还没有学期或假期。</p> : (
        <div aria-label="学期与假期列表" className={styles.periodCardList}>
          {sortedPeriods.map((period) => (
            <article className={styles.periodCard} data-period-id={period.id} data-testid="learning-period-card" key={period.id}>
              <button aria-pressed={period.id === selectedPeriod?.id} className={styles.periodSelect} onClick={() => onSelect?.(period)} type="button">
                <span className={styles.periodKind}>{kindLabels[period.kind]}</span>
                <strong>{period.name}</strong>
                <span>{period.startDate} 至 {period.endDate}</span>
              </button>
            </article>
          ))}
        </div>
      )}
      {selectedPeriod ? (
        <details className={styles.periodActionsMenu}>
          <summary aria-label="更多学期操作" role="button"><MoreHorizontal aria-hidden size={20} /></summary>
          <div className={styles.periodActions} role="menu">
            <button className={styles.secondaryPeriodAction} onClick={() => onEdit?.(selectedPeriod)} role="menuitem" type="button">编辑学期或假期</button>
            {onReopenMigration ? <button className={styles.secondaryPeriodAction} onClick={() => onReopenMigration(selectedPeriod)} role="menuitem" type="button">处理上学期任务</button> : null}
            <button className={styles.dangerPeriodAction} onClick={() => onDelete?.(selectedPeriod)} role="menuitem" type="button">删除学期或假期</button>
          </div>
        </details>
      ) : null}
    </section>
  )
}
