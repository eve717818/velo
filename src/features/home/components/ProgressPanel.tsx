import styles from "../HomePage.module.css"

interface ProgressPanelProps {
  completedCount: number
  totalCount: number
}

export function ProgressPanel({ completedCount, totalCount }: ProgressPanelProps) {
  return (
    <section className={`${styles.panel} ${styles.progressPanel}`} aria-labelledby="home-progress-title">
      <h2 className={styles.sectionTitle} id="home-progress-title">
        今日学习进度
      </h2>
      <div
        aria-label={`已完成 ${completedCount} 项，共 ${totalCount} 项`}
        aria-valuemax={totalCount}
        aria-valuemin={0}
        aria-valuenow={completedCount}
        className={styles.progressCapsule}
        role="progressbar"
      >
        <div className={styles.progressSegments} aria-hidden="true">
          {Array.from({ length: totalCount }, (_, index) => (
            <span className={index < completedCount ? styles.progressSegmentComplete : styles.progressSegment} key={index} />
          ))}
        </div>
        <strong className={styles.progressCount}>
          {completedCount} / {totalCount}
        </strong>
      </div>
    </section>
  )
}
