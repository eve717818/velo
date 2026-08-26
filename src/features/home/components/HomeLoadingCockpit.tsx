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
      <section className={`${styles.panel} ${styles.progressPanel}`} aria-labelledby={sectionNames.progress}>
        <h2 className={styles.sectionTitle} id={sectionNames.progress}>
          今日学习进度
        </h2>
        <div className={styles.progressCapsule} aria-hidden="true">
          <span className={`${styles.loadingShape} ${styles.loadingProgressTrack}`} />
          <span className={`${styles.loadingShape} ${styles.loadingProgressCount}`} />
        </div>
      </section>

      <section className={styles.nextSection} aria-labelledby={sectionNames.next}>
        <h2 className={styles.sectionTitle} id={sectionNames.next}>
          接下来
        </h2>
        <div className={`${styles.nextCard} ${styles.loadingCard}`} aria-hidden="true">
          <span className={styles.loadingCircle} />
          <span className={`${styles.loadingShape} ${styles.loadingTaskCopy}`} />
          <span className={styles.loadingCircle} />
        </div>
      </section>

      <section className={styles.noteSection} aria-labelledby={sectionNames.note}>
        <h2 className={styles.sectionTitle} id={sectionNames.note}>
          最近笔记
        </h2>
        <div className={`${styles.noteRow} ${styles.loadingCard}`} aria-hidden="true">
          <span className={styles.loadingCircle} />
          <span className={`${styles.loadingShape} ${styles.loadingNoteCopy}`} />
          <span className={`${styles.loadingShape} ${styles.loadingAnnotation}`} />
        </div>
      </section>

      <section className={styles.quickSection} aria-labelledby={sectionNames.actions}>
        <h2 className={styles.sectionTitle} id={sectionNames.actions}>
          快捷操作
        </h2>
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
