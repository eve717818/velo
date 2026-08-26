import styles from "./MilestonePage.module.css"

export function NotesPage() {
  return (
    <main className={styles.page}>
      <h1>知识笔记</h1>
      <section className={styles.surface} aria-label="知识笔记里程碑说明">
        <p className={styles.eyebrow}>Milestone 03</p>
        <p>树状知识工作台将在里程碑 3 启用。</p>
      </section>
    </main>
  )
}
