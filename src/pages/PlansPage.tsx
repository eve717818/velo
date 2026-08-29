import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import type { VeloDB } from "@/db/velo-db"
import { veloDb } from "@/db/velo-db"
import { PlanHeader } from "@/features/plans/components/PlanHeader"
import { PlanProgress } from "@/features/plans/components/PlanProgress"
import { PlanViewSwitcher } from "@/features/plans/components/PlanViewSwitcher"
import { parseLocalDate } from "@/features/plans/domain/plan-dates"
import styles from "@/features/plans/PlansPage.module.css"
import { type PlanView, usePlanWorkspace } from "@/features/plans/usePlanWorkspace"
import { formatLocalDate } from "@/lib/local-date"

interface PlansPageProps {
  db?: VeloDB
  now?: Date
}

const planViews = new Set<PlanView>(["day", "week", "month", "period"])

const viewNames: Record<PlanView, string> = {
  day: "日计划",
  week: "周计划",
  month: "月计划",
  period: "学习周期",
}

function readView(value: string | null): PlanView {
  return value && planViews.has(value as PlanView) ? (value as PlanView) : "day"
}

function readDate(value: string | null, fallback: string) {
  if (!value) return fallback
  try {
    parseLocalDate(value)
    return value
  } catch {
    return fallback
  }
}

export function PlansPage({ db = veloDb, now }: PlansPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const fallbackDate = formatLocalDate(now ?? new Date())
  const rawView = searchParams.get("view")
  const rawDate = searchParams.get("date")
  const view = readView(rawView)
  const selectedDate = readDate(rawDate, fallbackDate)
  const periodId = searchParams.get("period") ?? undefined
  const snapshot = usePlanWorkspace({ db, view, selectedDate, periodId })

  useEffect(() => {
    if (rawView === view && rawDate === selectedDate) return

    const canonicalParams = new URLSearchParams(searchParams)
    canonicalParams.set("view", view)
    canonicalParams.set("date", selectedDate)
    setSearchParams(canonicalParams, { replace: true })
  }, [rawDate, rawView, searchParams, selectedDate, setSearchParams, view])

  function updateParameter(key: "view" | "date", value: string) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("view", view)
    nextParams.set("date", selectedDate)
    nextParams.set(key, value)
    setSearchParams(nextParams)
  }

  const createParams = new URLSearchParams(searchParams)
  createParams.set("view", view)
  createParams.set("date", selectedDate)
  createParams.set("new", "1")

  return (
    <main aria-busy={snapshot === undefined} className={styles.page}>
      <PlanHeader
        createHref={`/plans?${createParams.toString()}`}
        onDateChange={(date) => updateParameter("date", date)}
        selectedDate={selectedDate}
      />
      <div className={styles.toolbar}>
        <PlanViewSwitcher onChange={(nextView) => updateParameter("view", nextView)} value={view} />
      </div>
      <div aria-label="计划工作区" className={styles.workspaceGrid} role="region">
        <section className={styles.viewSurface}>
          <div className={styles.surfaceHeading}>
            <div>
              <h2>{viewNames[view]}</h2>
              <p>{view === "period" ? snapshot?.selectedPeriod?.name ?? "选择一个学习周期" : selectedDate}</p>
            </div>
            <span className={styles.rangeCount}>{snapshot?.tasks.length ?? 0} 项任务</span>
          </div>
          {snapshot?.tasks.length ? null : (
            <div className={styles.emptyState}>
              <div>
                <strong>当前范围还没有任务</strong>
                <p>从一个清晰、可完成的小任务开始安排。</p>
              </div>
            </div>
          )}
        </section>
        <PlanProgress
          completed={snapshot?.progress.completed ?? 0}
          total={snapshot?.progress.total ?? 0}
        />
        <section className={styles.periodContext}>
          <p className={styles.metaLabel}>学习周期</p>
          <h2>{snapshot?.selectedPeriod?.name ?? "尚未选择周期"}</h2>
          <p>{snapshot?.periods.length ?? 0} 个周期可用于组织学期与假期。</p>
        </section>
      </div>
    </main>
  )
}
