import { useEffect, useRef, useState } from "react"
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
import { UndoNotice } from "@/features/plans/components/UndoNotice"
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
import { RangePlanDrawer } from "@/features/plans/components/RangePlanDrawer"
import { RangePlanSummary } from "@/features/plans/components/RangePlanSummary"
import { SwipeDiscoveryHint } from "@/features/plans/components/SwipeDiscoveryHint"
import { useRequestSession } from "@/features/plans/components/useRequestSession"
import type { PlanTask, PlanTaskGroup } from "@/db/types"
import { parseLocalDate } from "@/features/plans/domain/plan-dates"
import { countTasksInPeriod } from "@/features/plans/domain/learning-periods"
import { deleteLearningPeriod } from "@/features/plans/data/learning-period-service"
import type { LearningPeriod } from "@/db/types"
import styles from "@/features/plans/PlansPage.module.css"
import { type PlanView, usePlanWorkspace } from "@/features/plans/usePlanWorkspace"
import { movePlanTask, setTaskCompletion } from "@/features/plans/data/plan-task-service"
import type { TaskPosition } from "@/features/plans/components/TaskBar"
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
  period: "学期与假期",
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
      setError(error instanceof Error ? error.message : "删除学期或假期失败")
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsDeleting(false)
    }
  }

  return (
    <PlanDialog labelledBy="delete-period-heading" onRequestClose={requestClose} open>
      <section aria-busy={isDeleting} className={styles.periodDeleteDialog}>
        <p className={styles.metaLabel}>删除学期或假期</p>
        <h2 id="delete-period-heading">删除“{period.name}”？</h2>
        <p>{taskCount} 项任务将变为未归属学期或假期，任务本身不会删除。</p>
        {error ? <PlanErrorState error={error} onRetry={() => { void confirmDelete(period.id) }} /> : null}
        <div className={styles.migrationActions}>
          <button className={styles.secondaryPeriodAction} onClick={requestClose} type="button">取消</button>
          <button className={styles.dangerPeriodAction} disabled={isDeleting} onClick={() => { void confirmDelete() }} type="button">确认删除</button>
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
  const [editorTaskGroup, setEditorTaskGroup] = useState<PlanTaskGroup | null>(null)
  const [deleteTask, setDeleteTask] = useState<PlanTask | null>(null)
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState("")
  const [taskTrigger, setTaskTrigger] = useState<HTMLElement | null>(null)
  const [isPeriodDialogOpen, setIsPeriodDialogOpen] = useState(false)
  const [isRangePlanDrawerOpen, setIsRangePlanDrawerOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<LearningPeriod | undefined>()
  const [periodToDelete, setPeriodToDelete] = useState<LearningPeriod | null>(null)
  const [isMigrationOpen, setIsMigrationOpen] = useState(false)
  const [migrationReopenError, setMigrationReopenError] = useState("")
  const [migrationReopenSaving, setMigrationReopenSaving] = useState(false)
  const migrationReopenIntent = useRef<{ source: LearningPeriod; target: LearningPeriod } | null>(null)
  const migrationReopenSession = useRequestSession()
  const [completionError, setCompletionError] = useState("")
  const [completionSaving, setCompletionSaving] = useState(false)
  const completionIntent = useRef<{ taskId: string; nextValue: boolean } | null>(null)
  const completionSession = useRequestSession()
  const [moveUndo, setMoveUndo] = useState<{ taskId: string; previous: TaskPosition; expected: TaskPosition } | null>(null)
  const [moveUndoError, setMoveUndoError] = useState("")
  const [moveUndoSaving, setMoveUndoSaving] = useState(false)
  const moveUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveUndoGeneration = useRef(0)
  const isCreating = searchParams.get("new") === "1"
  const activePeriod = snapshot?.selectedPeriod ?? snapshot?.periods[0] ?? null
  const migrationSource = activePeriod && activePeriod.endDate >= fallbackDate
    ? snapshot?.periods.filter((period) => period.endDate < activePeriod.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0] ?? null
    : null
  const migrationTasks = migrationSource && snapshot
    ? snapshot.allTasks.filter((task) => task.isCompleted === 0 && task.scheduledDate >= migrationSource.startDate && task.scheduledDate <= migrationSource.endDate)
    : []
  const migrationKey = migrationSource && activePeriod ? periodMigrationDismissalKey(migrationSource.id, activePeriod.id) : ""
  const migrationDismissal = useLiveQuery(async () => migrationKey ? db.appMeta.get(migrationKey) : undefined, [db, migrationKey])
  const legacyTasks = useLiveQuery(() => db.legacyPlanTasks.toArray(), [db])

  useEffect(() => () => {
    if (moveUndoTimer.current) clearTimeout(moveUndoTimer.current)
  }, [])

  function handleTaskMoved(task: PlanTask, previous: TaskPosition) {
    const generation = ++moveUndoGeneration.current
    if (moveUndoTimer.current) clearTimeout(moveUndoTimer.current)
    setMoveUndo({
      taskId: task.id,
      previous,
      expected: {
        scheduledDate: task.scheduledDate,
        startMinutes: task.startMinutes,
        order: task.order,
      },
    })
    setMoveUndoError("")
    setMoveUndoSaving(false)
    moveUndoTimer.current = setTimeout(() => {
      if (moveUndoGeneration.current !== generation) return
      moveUndoTimer.current = null
      setMoveUndo(null)
      setMoveUndoError("")
    }, 5_000)
  }

  async function undoTaskMove() {
    if (!moveUndo || moveUndoSaving) return
    const pendingUndo = moveUndo
    const generation = moveUndoGeneration.current
    if (moveUndoTimer.current) clearTimeout(moveUndoTimer.current)
    moveUndoTimer.current = null
    setMoveUndoSaving(true)
    setMoveUndoError("")
    try {
      await movePlanTask(db, pendingUndo.taskId, { ...pendingUndo.previous, expectedPosition: pendingUndo.expected }, Date.now())
      if (moveUndoGeneration.current === generation) setMoveUndo(null)
    } catch (error) {
      if (moveUndoGeneration.current === generation) {
        setMoveUndoError(error instanceof Error ? error.message : "恢复任务位置失败")
      }
    } finally {
      if (moveUndoGeneration.current === generation) setMoveUndoSaving(false)
    }
  }

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
    if (period.id !== periodId) {
      migrationReopenSession.invalidate()
      setMigrationReopenError("")
      setMigrationReopenSaving(false)
    }
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

  async function reopenMigrationFor(period: LearningPeriod, retryIntent?: { source: LearningPeriod; target: LearningPeriod }) {
    const target = retryIntent?.target ?? { ...period }
    if (target.endDate < fallbackDate) return
    const source = retryIntent?.source ?? snapshot?.periods.filter((candidate) => candidate.endDate < target.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0]
    if (!source) return
    const intent = { source: { ...source }, target: { ...target } }
    migrationReopenIntent.current = intent
    const requestToken = migrationReopenSession.beginRequest()
    setMigrationReopenSaving(true)
    setMigrationReopenError("")
    try {
      await reopenPeriodMigration(db, intent.source.id, intent.target.id)
      if (!migrationReopenSession.isCurrent(requestToken)) return
      setMigrationReopenError("")
      setMigrationReopenSaving(false)
      selectPeriod(intent.target)
      setIsMigrationOpen(true)
    } catch (error) {
      if (!migrationReopenSession.isCurrent(requestToken)) return
      setMigrationReopenError(error instanceof Error ? error.message : "重新打开学期衔接失败")
    } finally {
      if (migrationReopenSession.isCurrent(requestToken)) setMigrationReopenSaving(false)
    }
  }

  function handlePeriodDeleted(deletedPeriodId: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextParams.get("period") === deletedPeriodId) nextParams.delete("period")
    setSearchParams(nextParams)
  }

  function openTask(openedTask: PlanTask, trigger: HTMLButtonElement) {
    completionSession.invalidate()
    setCompletionSaving(false)
    setCompletionError("")
    setActionNotice("")
    setTaskTrigger(trigger)
    setActionTask(openedTask)
    setIsActionDialogOpen(true)
  }

  function closeTaskActions() {
    completionSession.invalidate()
    setCompletionSaving(false)
    setCompletionError("")
    setIsActionDialogOpen(false)
  }

  async function toggleTaskCompletion(nextValue: boolean, retryTaskId?: string) {
    const taskId = retryTaskId ?? actionTask?.id
    if (!taskId || completionSaving) return
    const intent = { taskId, nextValue }
    completionIntent.current = intent
    const requestToken = completionSession.beginRequest()
    setCompletionSaving(true)
    setCompletionError("")
    try {
      await setTaskCompletion(db, intent.taskId, intent.nextValue, Date.now())
      if (!completionSession.isCurrent(requestToken)) return
      closeTaskActions()
    } catch (error) {
      if (!completionSession.isCurrent(requestToken)) return
      setCompletionError(error instanceof Error ? error.message : "更新任务状态失败")
    } finally {
      if (completionSession.isCurrent(requestToken)) setCompletionSaving(false)
    }
  }

  function closeEditor() {
    setEditorTask(null)
    setEditorTaskGroup(null)
    if (!isCreating) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("new")
    setSearchParams(nextParams, { replace: true })
  }

  const createParams = new URLSearchParams(searchParams)
  createParams.set("view", view)
  createParams.set("date", selectedDate)
  createParams.set("new", "1")

  function editActionTask(task: PlanTask) {
    const taskGroup = task.groupId ? snapshot?.taskGroupById[task.groupId] : undefined
    if (taskGroup) {
      setEditorTaskGroup(taskGroup)
    } else {
      setEditorTask(task)
    }
    setIsActionDialogOpen(false)
  }

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
      <div aria-label="计划工作区" className={styles.workspaceGrid} data-view={view} role="region">
        <section className={styles.viewSurface}>
          <div className={styles.surfaceHeading}>
            <div>
              <h2>{viewNames[view]}</h2>
              <p>{view === "period" ? snapshot?.selectedPeriod?.name ?? "选择一个学期或假期" : selectedDate}</p>
            </div>
            <span className={styles.rangeCount}>{snapshot?.tasks.length ?? 0} 项任务</span>
          </div>
          {snapshot && (view === "week" || view === "month") ? (
            <RangePlanSummary
              kind={view}
              onOpen={() => setIsRangePlanDrawerOpen(true)}
              plan={snapshot.rangePlan}
            />
          ) : null}
          <SwipeDiscoveryHint visible={Boolean(snapshot?.tasks.some((task) => task.isCompleted === 0)) && view !== "period"} />
          {snapshot ? (
            view === "day" ? <DayPlanView db={db} onCreate={openCreate} onMoved={handleTaskMoved} onOpen={openTask} selectedDate={selectedDate} taskGroups={snapshot.taskGroups} tasks={snapshot.tasks} today={fallbackDate} />
              : view === "week" ? <WeekPlanView db={db} onMoved={handleTaskMoved} onOpen={openTask} selectedDate={selectedDate} taskGroups={snapshot.taskGroups} tasks={snapshot.tasks} />
                : view === "month" ? <MonthPlanView db={db} onMoved={handleTaskMoved} onOpen={openTask} selectedDate={selectedDate} taskGroups={snapshot.taskGroups} tasks={snapshot.tasks} />
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
          view={view}
        />
        <section className={styles.periodContext}>
          <p className={styles.metaLabel}>当前学期</p>
          <h2>{activePeriod?.name ?? "当前日期未归属学期或假期"}</h2>
          <p>{snapshot?.periods.length ?? 0} 个学期或假期可用于组织长期学习。</p>
        </section>
      </div>
      {moveUndo ? <UndoNotice message="已移动到目标位置" onUndo={() => { void undoTaskMove() }} /> : null}
      {moveUndoError ? <PlanErrorState error={moveUndoError} onRetry={() => { void undoTaskMove() }} /> : null}
      {actionNotice ? <p className={styles.actionNotice} role="status">{actionNotice}</p> : null}
      <TaskEditorDialog
        db={db}
        initialDate={selectedDate}
        onClose={closeEditor}
        open={isCreating || editorTask !== null || editorTaskGroup !== null}
        returnFocusTo={editorTask || editorTaskGroup ? taskTrigger : null}
        task={editorTask ?? undefined}
        taskGroup={editorTaskGroup ?? undefined}
      />
      {actionTask ? (
        <TaskActionsDialog
          completionError={completionError}
          completionSaving={completionSaving}
          onClose={closeTaskActions}
          onDelete={() => { setDeleteTask(actionTask); setIsActionDialogOpen(false); setIsDeleteDialogOpen(true) }}
          onEdit={() => editActionTask(actionTask)}
          onMove={() => { setEditorTask(actionTask); setIsActionDialogOpen(false) }}
          onRetryCompletion={() => { if (completionIntent.current) void toggleTaskCompletion(completionIntent.current.nextValue, completionIntent.current.taskId) }}
          onStartFocus={(href) => { setIsActionDialogOpen(false); void navigate(href) }}
          onToggleCompletion={(nextValue) => { void toggleTaskCompletion(nextValue) }}
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
      {(view === "week" || view === "month") ? (
        <RangePlanDrawer
          completed={snapshot?.progress.completed ?? 0}
          db={db}
          kind={view}
          onClose={() => setIsRangePlanDrawerOpen(false)}
          open={isRangePlanDrawerOpen}
          plan={snapshot?.rangePlan ?? null}
          selectedDate={selectedDate}
          total={snapshot?.progress.total ?? 0}
        />
      ) : null}
      {periodToDelete ? <DeletePeriodDialog db={db} key={`${periodToDelete.id}-${periodToDelete.updatedAt}`} onClose={() => setPeriodToDelete(null)} onDeleted={handlePeriodDeleted} period={periodToDelete} taskCount={countTasksInPeriod(snapshot?.allTasks ?? [], periodToDelete)} /> : null}
      {migrationReopenError ? <PlanErrorState error={migrationReopenError} onRetry={() => { if (migrationReopenIntent.current) void reopenMigrationFor(migrationReopenIntent.current.target, migrationReopenIntent.current) }} /> : null}
      {migrationSource && activePeriod && migrationTasks.length > 0 && !migrationDismissal ? <div className={styles.migrationBanner}><span>上一学期或假期还有 {migrationTasks.length} 个任务未完成</span><button disabled={migrationReopenSaving} onClick={() => setIsMigrationOpen(true)} type="button">查看并复制</button></div> : null}
      {migrationSource && activePeriod ? <PeriodMigrationPanel db={db} onClose={() => setIsMigrationOpen(false)} open={isMigrationOpen} sourcePeriod={migrationSource} targetPeriod={activePeriod} tasks={migrationTasks} today={fallbackDate} /> : null}
      {legacyTasks ? <LegacyPlanMigrationPanel db={db} legacyTasks={legacyTasks} open={legacyTasks.length > 0} /> : null}
    </main>
  )
}
