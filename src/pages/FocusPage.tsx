import styles from "./MilestonePage.module.css"

export function FocusPage() {
  return (
    <main className={styles.page}>
      <h1>专注</h1>
      <section className={styles.surface} aria-label="专注里程碑说明">
        <p className={styles.eyebrow}>Milestone 04</p>
        <p>番茄钟将在里程碑 4 启用。</p>
      </section>
    </main>
  )
}
