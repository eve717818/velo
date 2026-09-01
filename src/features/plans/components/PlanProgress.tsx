import styles from "../PlansPage.module.css"
import type { PlanView } from "../usePlanWorkspace"

interface PlanProgressProps {
  completed: number
  total: number
  view: PlanView
}

const completedCopy: Record<PlanView, string> = {
  day: "今日任务已全部完成",
  week: "本周任务已全部完成",
  month: "本月任务已全部完成",
  period: "本学期任务已全部完成",
}

export function PlanProgress({ completed, total, view }: PlanProgressProps) {
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
        {total === 0 ? "当前还没有任务" : completed === total ? completedCopy[view] : `已完成 ${completed} 项，还有 ${total - completed} 项`}
      </p>
    </section>
  )
}
