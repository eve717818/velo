import { useLiveQuery } from "dexie-react-hooks"
import type { VeloDB } from "@/db/velo-db"
import { veloDb } from "@/db/velo-db"
import { formatLocalDate } from "@/lib/local-date"
import { NextTaskCard } from "./components/NextTaskCard"
import { HomeLoadingCockpit } from "./components/HomeLoadingCockpit"
import { ProgressPanel } from "./components/ProgressPanel"
import { QuickActions } from "./components/QuickActions"
import { RecentNoteRow } from "./components/RecentNoteRow"
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
  const database = db ?? veloDb
  const dayPeriodKey = formatLocalDate(currentDate)
  const snapshot = useLiveQuery(async () => {
    const [tasks, recentNotes] = await Promise.all([
      database.planTasks.where("[scope+periodKey]").equals(["day", dayPeriodKey]).sortBy("order"),
      database.notes.orderBy("updatedAt").reverse().limit(1).toArray(),
    ])

    return {
      completedCount: tasks.filter((task) => task.isCompleted === 1).length,
      totalCount: tasks.length,
      nextTask: tasks.find((task) => task.isCompleted === 0) ?? null,
      recentNote: recentNotes[0] ?? null,
    }
  }, [database, dayPeriodKey])
  const isLoading = snapshot === undefined

  return (
    <main aria-busy={isLoading} className={styles.page}>
      {isLoading ? (
        <HomeLoadingCockpit />
      ) : (
        <div aria-label="今日学习工作台" className={styles.cockpitGrid} data-layout="bento" role="region">
          <ProgressPanel
            completedCount={snapshot.completedCount}
            dateLabel={formatDisplayDate(currentDate)}
            greeting={`${greetingFor(currentDate)}，Alex`}
            totalCount={snapshot.totalCount}
          />
          <NextTaskCard task={snapshot.nextTask} totalCount={snapshot.totalCount} />
          <RecentNoteRow note={snapshot.recentNote} />
          <QuickActions />
        </div>
      )}
      {isLoading ? <span className={styles.visuallyHidden}>正在加载今日学习概览</span> : null}
    </main>
  )
}
