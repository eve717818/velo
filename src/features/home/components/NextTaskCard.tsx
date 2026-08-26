import { ArrowRight, BookOpen } from "lucide-react"
import { Link } from "react-router-dom"
import type { PlanTask } from "@/db/types"
import styles from "../HomePage.module.css"

interface NextTaskCardProps {
  task: PlanTask | null
  totalCount: number
}

export function NextTaskCard({ task, totalCount }: NextTaskCardProps) {
  return (
    <section className={styles.nextSection} aria-labelledby="home-next-title">
      <h2 className={styles.sectionTitle} id="home-next-title">
        接下来
      </h2>
      {task ? (
        <Link aria-label={`查看下一项任务：${task.title}`} className={styles.nextCard} to="/plans">
          <span className={styles.nextIcon} aria-hidden="true">
            <BookOpen size={30} strokeWidth={1.9} />
          </span>
          <span className={styles.nextCopy}>
            {task.subject ? <span className={styles.taskSubject}>{task.subject}</span> : null}
            <strong>{task.title}</strong>
            {task.estimatedMinutes ? <span className={styles.taskMeta}>预计 {task.estimatedMinutes} 分钟</span> : null}
          </span>
          <span className={styles.nextArrow} aria-hidden="true">
            <ArrowRight size={28} />
          </span>
        </Link>
      ) : (
        <div className={`${styles.nextCard} ${styles.emptyCard}`}>
          <div>
            <strong>{totalCount === 0 ? "今天还没有计划" : "今天的计划已全部完成"}</strong>
            <p>{totalCount === 0 ? "从一个清晰的小目标开始。" : "做得很好，可以回顾今天的进展。"}</p>
          </div>
          <Link className={styles.emptyLink} to={totalCount === 0 ? "/plans?new=1" : "/plans"}>
            {totalCount === 0 ? "创建今日计划" : "查看今日计划"}
          </Link>
        </div>
      )}
    </section>
  )
}
