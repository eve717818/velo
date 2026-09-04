import { Plus } from "lucide-react"
import { Link } from "react-router-dom"
import styles from "../PlansPage.module.css"

interface PlanHeaderProps {
  createHref: string
  showCreate?: boolean
}

export function PlanHeader({ createHref, showCreate = true }: PlanHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headingCopy}>
        <p className={styles.eyebrow}>学习节奏</p>
        <h1>学习计划</h1>
        <p>分层安排任务，保持清晰节奏。</p>
      </div>
      <div className={styles.headerActions}>
        {showCreate ? (
          <Link className={styles.primaryAction} to={createHref}>
            <Plus aria-hidden="true" size={18} strokeWidth={2} />
            新建任务
          </Link>
        ) : null}
      </div>
    </header>
  )
}
