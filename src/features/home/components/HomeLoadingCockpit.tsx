import styles from "../HomePage.module.css"

const sectionNames = {
  progress: "home-loading-progress-title",
  next: "home-loading-next-title",
  note: "home-loading-note-title",
  actions: "home-loading-actions-title",
}

export function HomeLoadingCockpit() {
  return (
    <div className={styles.cockpitGrid}>
      <section
        className={`${styles.panel} ${styles.progressPanel}`}
        aria-labelledby={sectionNames.progress}
        data-bento-card="progress"
      >
        <div className={styles.welcomeCopy} aria-hidden="true">
          <span className={`${styles.loadingShape} ${styles.loadingActionCopy}`} />
          <span className={`${styles.loadingShape} ${styles.loadingTaskCopy}`} />
        </div>
        <div className={styles.progressCapsule}>
          <div className={styles.progressHeading}>
            <h2 className={styles.sectionTitle} id={sectionNames.progress}>
              今日学习进度
            </h2>
            <span className={`${styles.loadingShape} ${styles.loadingProgressCount}`} />
          </div>
          <span className={`${styles.loadingShape} ${styles.loadingProgressTrack}`} />
        </div>
      </section>

      <section className={styles.nextCard} aria-labelledby={sectionNames.next} data-bento-card="next">
        <div className={styles.cardHeadingRow}>
          <h2 className={styles.sectionTitle} id={sectionNames.next}>
            接下来
          </h2>
        </div>
        <div className={`${styles.taskLink} ${styles.loadingCard}`} aria-hidden="true">
          <span className={styles.loadingCircle} />
          <span className={`${styles.loadingShape} ${styles.loadingTaskCopy}`} />
          <span className={styles.loadingCircle} />
        </div>
      </section>

      <section className={styles.noteCard} aria-labelledby={sectionNames.note} data-bento-card="note">
        <div className={styles.cardHeadingRow}>
          <h2 className={styles.sectionTitle} id={sectionNames.note}>
            最近笔记
          </h2>
        </div>
        <div className={`${styles.noteRow} ${styles.loadingCard}`} aria-hidden="true">
          <span className={styles.loadingCircle} />
          <span className={`${styles.loadingShape} ${styles.loadingNoteCopy}`} />
          <span className={`${styles.loadingShape} ${styles.loadingAnnotation}`} />
        </div>
      </section>

      <section className={styles.quickPanel} aria-labelledby={sectionNames.actions} data-bento-card="actions">
        <div className={styles.cardHeadingRow}>
          <h2 className={styles.sectionTitle} id={sectionNames.actions}>
            快捷操作
          </h2>
        </div>
        <div className={styles.quickActions} aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div className={`${styles.quickAction} ${styles.loadingQuickAction}`} key={index}>
              <span className={styles.loadingCircle} />
              <span className={`${styles.loadingShape} ${styles.loadingActionCopy}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
