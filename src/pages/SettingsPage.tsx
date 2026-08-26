import styles from "./MilestonePage.module.css"

export function SettingsPage() {
  return (
    <main className={styles.page}>
      <h1>设置</h1>
      <section className={styles.surface} aria-label="设置里程碑说明">
        <p className={styles.eyebrow}>Local first</p>
        <p>本地数据与偏好设置将在后续里程碑逐步开放。</p>
      </section>
    </main>
  )
}
