import styles from "./MilestonePage.module.css"

export function PlansPage() {
  return (
    <main className={styles.page}>
      <h1>学习计划</h1>
      <section className={styles.surface} aria-label="学习计划里程碑说明">
        <p className={styles.eyebrow}>Milestone 02</p>
        <p>日、周、月和学期计划将在里程碑 2 启用。</p>
      </section>
    </main>
  )
}
