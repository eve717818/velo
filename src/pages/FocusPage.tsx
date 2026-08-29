import styles from "./MilestonePage.module.css"
import { useSearchParams } from "react-router-dom"
import { readFocusMinutes } from "@/features/plans/focus-link"

export function FocusPage() {
  const [searchParams] = useSearchParams()
  const taskId = searchParams.get("task")
  const minutes = readFocusMinutes(searchParams.get("minutes"))

  return (
    <main className={styles.page}>
      <h1>专注</h1>
      <section className={styles.surface} aria-label="专注里程碑说明">
        <p className={styles.eyebrow}>Milestone 04</p>
        {taskId ? <p>关联任务：{taskId}</p> : <p>尚未关联学习任务</p>}
        <p>本次预计 {minutes} 分钟</p>
        <p>番茄钟将在里程碑 4 启用。</p>
      </section>
    </main>
  )
}
