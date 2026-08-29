import styles from "../PlansPage.module.css"

interface PlanProgressProps {
  completed: number
  total: number
}

export function PlanProgress({ completed, total }: PlanProgressProps) {
  return (
    <section aria-labelledby="plan-progress-heading" className={styles.progressPanel}>
      <div className={styles.progressCopy}>
        <div>
          <p className={styles.metaLabel}>当前范围</p>
          <h2 id="plan-progress-heading">完成进度</h2>
        </div>
        <strong aria-live="polite" className={styles.progressCount}>
          {completed} / {total}
        </strong>
      </div>
      <progress aria-label="当前视图完成进度" max={total || 1} value={completed} />
      <p className={styles.progressHint}>
        {total === 0 ? "还没有安排任务" : completed === total ? "这个范围已经完成" : `还有 ${total - completed} 项待完成`}
      </p>
    </section>
  )
}
