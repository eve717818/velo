import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { VeloDB } from "@/db/velo-db"
import { veloDb } from "@/db/velo-db"
import { PlanHeader } from "@/features/plans/components/PlanHeader"
import { PlanProgress } from "@/features/plans/components/PlanProgress"
import { PlanViewSwitcher } from "@/features/plans/components/PlanViewSwitcher"
import { DeleteTaskDialog } from "@/features/plans/components/DeleteTaskDialog"
import { TaskActionsDialog } from "@/features/plans/components/TaskActionsDialog"
import { TaskEditorDialog } from "@/features/plans/components/TaskEditorDialog"
import { DayPlanView } from "@/features/plans/components/DayPlanView"
import { MonthPlanView } from "@/features/plans/components/MonthPlanView"
import { TaskBar } from "@/features/plans/components/TaskBar"
import { WeekPlanView } from "@/features/plans/components/WeekPlanView"
import type { PlanTask } from "@/db/types"
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
  const [actionTask, setActionTask] = useState<PlanTask | null>(null)
  const [editorTask, setEditorTask] = useState<PlanTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<PlanTask | null>(null)
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState("")
  const [taskTrigger, setTaskTrigger] = useState<HTMLElement | null>(null)
  const isCreating = searchParams.get("new") === "1"

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

  function openCreate() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("view", view)
    nextParams.set("date", selectedDate)
    nextParams.set("new", "1")
    setSearchParams(nextParams)
  }

  function openTask(openedTask: PlanTask, trigger: HTMLButtonElement) {
    setActionNotice("")
    setTaskTrigger(trigger)
    setActionTask(openedTask)
    setIsActionDialogOpen(true)
  }

  function closeEditor() {
    setEditorTask(null)
    if (!isCreating) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("new")
    setSearchParams(nextParams, { replace: true })
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
        showCreate={view !== "day" || Boolean(snapshot?.tasks.length)}
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
          {snapshot ? (
            view === "day" ? <DayPlanView db={db} onCreate={openCreate} onOpen={openTask} selectedDate={selectedDate} tasks={snapshot.tasks} today={fallbackDate} />
              : view === "week" ? <WeekPlanView db={db} onOpen={openTask} selectedDate={selectedDate} tasks={snapshot.tasks} />
                : view === "month" ? <MonthPlanView db={db} onOpen={openTask} selectedDate={selectedDate} tasks={snapshot.tasks} />
                  : snapshot.tasks.length ? (
                    <ul className={styles.taskList} data-drop-date={selectedDate} data-testid="current-plan-drop-zone">
                      {snapshot.tasks.map((task) => <li key={task.id}><TaskBar db={db} onOpen={openTask} task={task} /></li>)}
                    </ul>
                  ) : (
                    <div className={styles.emptyState}>
                      <div><strong>当前范围还没有任务</strong><p>从一个清晰、可完成的小任务开始安排。</p></div>
                    </div>
                  )
          ) : null}
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
      {actionNotice ? <p className={styles.actionNotice} role="status">{actionNotice}</p> : null}
      <TaskEditorDialog
        db={db}
        initialDate={selectedDate}
        onClose={closeEditor}
        open={isCreating || editorTask !== null}
        returnFocusTo={editorTask ? taskTrigger : null}
        task={editorTask ?? undefined}
      />
      {actionTask ? (
        <TaskActionsDialog
          onClose={() => setIsActionDialogOpen(false)}
          onDelete={() => { setDeleteTask(actionTask); setIsActionDialogOpen(false); setIsDeleteDialogOpen(true) }}
          onEdit={() => { setEditorTask(actionTask); setIsActionDialogOpen(false) }}
          onMove={() => { setActionNotice("移动入口将在后续排程任务中连接。"); setIsActionDialogOpen(false) }}
          onStartFocus={() => { setActionNotice("开始专注入口将在后续专注任务中连接。"); setIsActionDialogOpen(false) }}
          open={isActionDialogOpen}
          task={actionTask}
        />
      ) : null}
      {deleteTask ? <DeleteTaskDialog db={db} onClose={() => setIsDeleteDialogOpen(false)} open={isDeleteDialogOpen} returnFocusTo={taskTrigger} task={deleteTask} /> : null}
    </main>
  )
}
