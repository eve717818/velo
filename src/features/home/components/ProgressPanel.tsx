import styles from "../HomePage.module.css"
import { motion, useReducedMotion } from "motion/react"

interface ProgressPanelProps {
  completedCount: number
  totalCount: number
}

export function ProgressPanel({ completedCount, totalCount }: ProgressPanelProps) {
  const reduced = useReducedMotion() ?? false
  const progressSemantics =
    totalCount > 0
      ? {
          "aria-label": `已完成 ${completedCount} 项，共 ${totalCount} 项`,
          "aria-valuemax": totalCount,
          "aria-valuemin": 0,
          "aria-valuenow": completedCount,
          role: "progressbar" as const,
        }
      : {
          "aria-label": "今天还没有学习进度",
          role: "status" as const,
        }

  return (
    <section className={`${styles.panel} ${styles.progressPanel}`} aria-labelledby="home-progress-title">
      <h2 className={styles.sectionTitle} id="home-progress-title">
        今日学习进度
      </h2>
      <div
        className={styles.progressCapsule}
        {...progressSemantics}
      >
        <div className={styles.progressSegments} aria-hidden="true">
          {Array.from({ length: totalCount }, (_, index) => (
            <motion.span
              animate={{ opacity: index < completedCount ? 1 : 0.28, scaleX: 1 }}
              className={index < completedCount ? styles.progressSegmentComplete : styles.progressSegment}
              initial={false}
              key={index}
              transition={{ duration: reduced ? 0 : 0.24, delay: reduced ? 0 : index * 0.035 }}
            />
          ))}
        </div>
        <strong className={styles.progressCount}>
          {completedCount} / {totalCount}
        </strong>
      </div>
    </section>
  )
}
