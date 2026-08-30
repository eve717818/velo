import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
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
import { WeekPlanView } from "@/features/plans/components/WeekPlanView"
import { LearningPeriodDialog } from "@/features/plans/components/LearningPeriodDialog"
import { LearningPeriodView } from "@/features/plans/components/LearningPeriodView"
import { LegacyPlanMigrationPanel } from "@/features/plans/components/LegacyPlanMigrationPanel"
import { PeriodMigrationPanel } from "@/features/plans/components/PeriodMigrationPanel"
import { periodMigrationDismissalKey, reopenPeriodMigration } from "@/features/plans/data/period-migration-service"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import { PlanErrorState } from "@/features/plans/components/PlanErrorState"
import { useRequestSession } from "@/features/plans/components/useRequestSession"
import type { PlanTask } from "@/db/types"
import { parseLocalDate } from "@/features/plans/domain/plan-dates"
import { countTasksInPeriod } from "@/features/plans/domain/learning-periods"
import { deleteLearningPeriod } from "@/features/plans/data/learning-period-service"
import type { LearningPeriod } from "@/db/types"
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

interface DeletePeriodDialogProps {
  db: VeloDB
  onClose: () => void
  onDeleted: (periodId: string) => void
  period: LearningPeriod
  taskCount: number
}

function DeletePeriodDialog({ db, onClose, onDeleted, period, taskCount }: DeletePeriodDialogProps) {
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const requestSession = useRequestSession()

  function requestClose() {
    requestSession.invalidate()
    onClose()
  }

  async function confirmDelete(retryPeriodId?: string) {
    const periodId = retryPeriodId ?? period.id
    const requestToken = requestSession.beginRequest()
    setIsDeleting(true)
    setError("")
    try {
      await deleteLearningPeriod(db, periodId)
      if (!requestSession.isCurrent(requestToken)) return
      requestSession.invalidate()
      onDeleted(periodId)
      onClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      setError(error instanceof Error ? error.message : "删除周期失败")
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsDeleting(false)
    }
  }

  return (
    <PlanDialog labelledBy="delete-period-heading" onRequestClose={requestClose} open>
      <section aria-busy={isDeleting} className={styles.periodDeleteDialog}>
        <p className={styles.metaLabel}>删除学习周期</p>
        <h2 id="delete-period-heading">删除“{period.name}”？</h2>
        <p>{taskCount} 项任务将变为未归属周期，任务本身不会删除。</p>
        {error ? <PlanErrorState error={error} onRetry={() => { void confirmDelete(period.id) }} /> : null}
        <div className={styles.migrationActions}>
          <button className={styles.secondaryPeriodAction} onClick={requestClose} type="button">取消</button>
          <button className={styles.dangerPeriodAction} disabled={isDeleting} onClick={() => { void confirmDelete() }} type="button">删除周期</button>
        </div>
      </section>
    </PlanDialog>
  )
}

export function PlansPage({ db = veloDb, now }: PlansPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
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
  const [isPeriodDialogOpen, setIsPeriodDialogOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<LearningPeriod | undefined>()
  const [periodToDelete, setPeriodToDelete] = useState<LearningPeriod | null>(null)
  const [isMigrationOpen, setIsMigrationOpen] = useState(false)
  const isCreating = searchParams.get("new") === "1"
  const activePeriod = snapshot?.selectedPeriod ?? snapshot?.periods[0] ?? null
  const migrationSource = activePeriod
    ? snapshot?.periods.filter((period) => period.endDate < activePeriod.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0] ?? null
    : null
  const migrationTasks = migrationSource && snapshot
    ? snapshot.allTasks.filter((task) => task.isCompleted === 0 && task.scheduledDate >= migrationSource.startDate && task.scheduledDate <= migrationSource.endDate)
    : []
  const migrationKey = migrationSource && activePeriod ? periodMigrationDismissalKey(migrationSource.id, activePeriod.id) : ""
  const migrationDismissal = useLiveQuery(async () => migrationKey ? db.appMeta.get(migrationKey) : undefined, [db, migrationKey])
  const legacyTasks = useLiveQuery(() => db.legacyPlanTasks.toArray(), [db])

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

  function selectPeriod(period: LearningPeriod) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("view", "period")
    nextParams.set("date", selectedDate)
    nextParams.set("period", period.id)
    setSearchParams(nextParams)
  }

  function openPeriodEditor(period?: LearningPeriod) {
    setEditingPeriod(period)
    setIsPeriodDialogOpen(true)
  }

  async function reopenMigrationFor(period: LearningPeriod) {
    const source = snapshot?.periods.filter((candidate) => candidate.endDate < period.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0]
    if (!source) return
    await reopenPeriodMigration(db, source.id, period.id)
    selectPeriod(period)
    setIsMigrationOpen(true)
  }

  function handlePeriodDeleted(deletedPeriodId: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextParams.get("period") === deletedPeriodId) nextParams.delete("period")
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
        showCreate={view !== "period" && (view !== "day" || Boolean(snapshot?.tasks.length))}
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
                  : <LearningPeriodView
                    onCreate={() => openPeriodEditor()}
                    onDelete={(period) => setPeriodToDelete(period)}
                    onEdit={openPeriodEditor}
                    onEditTask={(task) => setEditorTask(task)}
                    onReopenMigration={(period) => { void reopenMigrationFor(period) }}
                    onSelect={selectPeriod}
                    periods={snapshot.periods}
                    selectedPeriodId={activePeriod?.id}
                    tasks={snapshot.allTasks}
                    today={fallbackDate}
                  />
          ) : null}
        </section>
        <PlanProgress
          completed={snapshot?.progress.completed ?? 0}
          total={snapshot?.progress.total ?? 0}
        />
        <section className={styles.periodContext}>
          <p className={styles.metaLabel}>学习周期</p>
          <h2>{activePeriod?.name ?? "尚未选择周期"}</h2>
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
          onMove={() => { setEditorTask(actionTask); setIsActionDialogOpen(false) }}
          onStartFocus={(href) => { setIsActionDialogOpen(false); void navigate(href) }}
          open={isActionDialogOpen}
          task={actionTask}
        />
      ) : null}
      {deleteTask ? <DeleteTaskDialog db={db} onClose={() => setIsDeleteDialogOpen(false)} open={isDeleteDialogOpen} returnFocusTo={taskTrigger} task={deleteTask} /> : null}
      <LearningPeriodDialog
        db={db}
        onClose={() => { setIsPeriodDialogOpen(false); setEditingPeriod(undefined) }}
        open={isPeriodDialogOpen}
        period={editingPeriod}
        periods={snapshot?.periods ?? []}
      />
      {periodToDelete ? <DeletePeriodDialog db={db} key={`${periodToDelete.id}-${periodToDelete.updatedAt}`} onClose={() => setPeriodToDelete(null)} onDeleted={handlePeriodDeleted} period={periodToDelete} taskCount={countTasksInPeriod(snapshot?.allTasks ?? [], periodToDelete)} /> : null}
      {migrationSource && activePeriod && migrationTasks.length > 0 && !migrationDismissal ? <div className={styles.migrationBanner}><span>上一学习周期还有 {migrationTasks.length} 个任务未完成</span><button onClick={() => setIsMigrationOpen(true)} type="button">查看并复制</button></div> : null}
      {migrationSource && activePeriod ? <PeriodMigrationPanel db={db} onClose={() => setIsMigrationOpen(false)} open={isMigrationOpen} sourcePeriod={migrationSource} targetPeriod={activePeriod} tasks={migrationTasks} today={fallbackDate} /> : null}
      {legacyTasks ? <LegacyPlanMigrationPanel db={db} legacyTasks={legacyTasks} open={legacyTasks.length > 0} /> : null}
    </main>
  )
}
