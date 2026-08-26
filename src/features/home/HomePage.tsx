import { Bell } from "lucide-react"
import type { VeloDB } from "@/db/velo-db"
import { NextTaskCard } from "./components/NextTaskCard"
import { ProgressPanel } from "./components/ProgressPanel"
import { QuickActions } from "./components/QuickActions"
import { RecentNoteRow } from "./components/RecentNoteRow"
import { useHomeSnapshot } from "./useHomeSnapshot"
import styles from "./HomePage.module.css"

interface HomePageProps {
  db?: VeloDB
  now?: Date
}

const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]

function greetingFor(date: Date) {
  if (date.getHours() < 12) return "早上好"
  if (date.getHours() < 18) return "下午好"
  return "晚上好"
}

function formatDisplayDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日，${weekdays[date.getDay()]}`
}

export function HomePage({ db, now }: HomePageProps) {
  const currentDate = now ?? new Date()
  const snapshot = useHomeSnapshot(db, currentDate)
  const isLoading = snapshot === undefined

  return (
    <main aria-busy={isLoading} className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{greetingFor(currentDate)}，Alex</h1>
          <p>{formatDisplayDate(currentDate)}</p>
        </div>
        <button aria-label="通知" className={styles.notificationButton} type="button">
          <Bell aria-hidden="true" size={25} strokeWidth={1.9} />
        </button>
      </header>

      {isLoading ? (
        <div className={styles.cockpitGrid} aria-hidden="true">
          <div className={`${styles.loadingBlock} ${styles.loadingProgress}`} />
          <div className={`${styles.loadingBlock} ${styles.loadingTask}`} />
          <div className={`${styles.loadingBlock} ${styles.loadingNote}`} />
          <div className={`${styles.loadingBlock} ${styles.loadingActions}`} />
        </div>
      ) : (
        <div className={styles.cockpitGrid}>
          <ProgressPanel completedCount={snapshot.completedCount} totalCount={snapshot.totalCount} />
          <NextTaskCard task={snapshot.nextTask} totalCount={snapshot.totalCount} />
          <RecentNoteRow note={snapshot.recentNote} />
          <QuickActions />
        </div>
      )}
      {isLoading ? <span className={styles.visuallyHidden}>正在加载今日学习概览</span> : null}
    </main>
  )
}
