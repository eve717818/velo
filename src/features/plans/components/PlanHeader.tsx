import { CalendarDays, Plus } from "lucide-react"
import { Link } from "react-router-dom"
import styles from "../PlansPage.module.css"

interface PlanHeaderProps {
  createHref: string
  showCreate?: boolean
  selectedDate: string
  onDateChange: (date: string) => void
}

export function PlanHeader({ createHref, showCreate = true, selectedDate, onDateChange }: PlanHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headingCopy}>
        <p className={styles.eyebrow}>学习节奏</p>
        <h1>学习计划</h1>
        <p>按日期组织任务，专注当下最重要的一步。</p>
      </div>
      <div className={styles.headerActions}>
        <label className={styles.dateControl}>
          <CalendarDays aria-hidden="true" size={18} strokeWidth={1.8} />
          <span>日期</span>
          <input
            aria-label="计划日期"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </label>
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
