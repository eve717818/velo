import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"

import type { LearningPeriod, PlanTask, PlanTaskScope } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { veloDb } from "@/db/velo-db"
import { DayPlanView } from "@/features/plans/components/DayPlanView"
import { DeleteTaskDialog } from "@/features/plans/components/DeleteTaskDialog"
import { LearningPeriodDialog } from "@/features/plans/components/LearningPeriodDialog"
import { LearningPeriodView } from "@/features/plans/components/LearningPeriodView"
import { PeriodMigrationPanel } from "@/features/plans/components/PeriodMigrationPanel"
import { PlanErrorState } from "@/features/plans/components/PlanErrorState"
import { PlanHeader } from "@/features/plans/components/PlanHeader"
import { PlanPeriodNavigator } from "@/features/plans/components/PlanPeriodNavigator"
import { PlanProgress } from "@/features/plans/components/PlanProgress"
import { PlanTaskListView } from "@/features/plans/components/PlanTaskListView"
import { PlanViewSwitcher } from "@/features/plans/components/PlanViewSwitcher"
import { TaskActionsDialog } from "@/features/plans/components/TaskActionsDialog"
import { TaskEditorDialog } from "@/features/plans/components/TaskEditorDialog"
import { deleteLearningPeriod } from "@/features/plans/data/learning-period-service"
import { periodMigrationDismissalKey, reopenPeriodMigration } from "@/features/plans/data/period-migration-service"
import { setTaskCompletion } from "@/features/plans/data/plan-task-service"
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

  async function confirmDelete() {
    setIsDeleting(true)
    setError("")
    try {
      await deleteLearningPeriod(db, period.id)
      onDeleted(period.id)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除学期或假期失败")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section aria-label="删除学期或假期" className={styles.periodDeleteDialog}>
      <h2>删除“{period.name}”？</h2>
      <p>{taskCount} 项学期任务将保留，但不再归属有效学习周期。</p>
      {error ? <PlanErrorState error={error} onRetry={() => { void confirmDelete() }} /> : null}
      <div className={styles.migrationActions}>
        <button className={styles.secondaryPeriodAction} onClick={onClose} type="button">取消</button>
        <button className={styles.dangerPeriodAction} disabled={isDeleting} onClick={() => { void confirmDelete() }} type="button">确认删除</button>
      </div>
    </section>
  )
}

export function PlansPage({ db = veloDb, now }: PlansPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const selectedDate = readDate(searchParams.get("date"), formatLocalDate(now ?? new Date()))
  const view = readView(searchParams.get("view"))
  const scope: PlanTaskScope = view === "period" ? "semester" : view
  const periodId = searchParams.get("period") ?? undefined
  const snapshot = usePlanWorkspace({ db, view, selectedDate, periodId })
  const [actionTask, setActionTask] = useState<PlanTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<PlanTask | null>(null)
  const [editorTask, setEditorTask] = useState<PlanTask | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<LearningPeriod | undefined>()
  const [periodToDelete, setPeriodToDelete] = useState<LearningPeriod | null>(null)
  const [isPeriodManagerOpen, setIsPeriodManagerOpen] = useState(false)
  const [isMigrationOpen, setIsMigrationOpen] = useState(false)
  const [completionError, setCompletionError] = useState("")
  const [completionSaving, setCompletionSaving] = useState(false)
  const isCreating = searchParams.get("new") === "1"
  const activePeriod = snapshot?.selectedPeriod ?? null
  const migrationSource = activePeriod
    ? snapshot?.periods.filter((period) => period.endDate < activePeriod.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0] ?? null
    : null
  const migrationTasks = useLiveQuery(
    () => migrationSource
      ? db.planTasks.where("[scope+periodKey]").equals(["semester", migrationSource.id]).filter((task) => task.isCompleted === 0).toArray()
      : Promise.resolve<PlanTask[]>([]),
    [db, migrationSource?.id],
  )
  const migrationKey = migrationSource && activePeriod ? periodMigrationDismissalKey(migrationSource.id, activePeriod.id) : ""
  const migrationDismissal = useLiveQuery(() => migrationKey ? db.appMeta.get(migrationKey) : Promise.resolve(undefined), [db, migrationKey])
  const periodTaskCount = useLiveQuery(
    () => periodToDelete ? db.planTasks.where("[scope+periodKey]").equals(["semester", periodToDelete.id]).count() : Promise.resolve(0),
    [db, periodToDelete?.id],
  )

  function updateParameters(changes: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(searchParams)
    next.set("view", view)
    next.set("date", selectedDate)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace })
  }

  function openCreate() {
    if (!snapshot?.periodKey) return
    updateParameters({ new: "1" })
  }

  function closeEditor() {
    setEditorTask(null)
    if (isCreating) updateParameters({ new: undefined }, true)
  }

  function selectPeriod(nextPeriodId: string) {
    updateParameters({ view: "period", period: nextPeriodId })
  }

  function openTask(task: PlanTask) {
    setActionTask(task)
    setCompletionError("")
  }

  async function toggleCompletion(nextValue: boolean) {
    if (!actionTask || completionSaving) return
    setCompletionSaving(true)
    setCompletionError("")
    try {
      await setTaskCompletion(db, actionTask.id, nextValue, Date.now())
      setActionTask(null)
    } catch (reason) {
      setCompletionError(reason instanceof Error ? reason.message : "更新任务状态失败")
    } finally {
      setCompletionSaving(false)
    }
  }

  async function reopenMigration(period: LearningPeriod) {
    const source = snapshot?.periods.filter((candidate) => candidate.endDate < period.startDate).sort((left, right) => right.endDate.localeCompare(left.endDate))[0]
    if (!source) return
    await reopenPeriodMigration(db, source.id, period.id)
    selectPeriod(period.id)
    setIsMigrationOpen(true)
  }

  const createParams = new URLSearchParams({ view, date: selectedDate, new: "1" })
  if (scope === "semester" && snapshot?.periodKey) createParams.set("period", snapshot.periodKey)

  return (
    <main aria-busy={snapshot === undefined} className={styles.page}>
      <PlanHeader createHref={`/plans?${createParams.toString()}`} showCreate={Boolean(snapshot?.periodKey)} />
      <div className={styles.toolbar}>
        <PlanViewSwitcher onChange={(nextView) => updateParameters({ view: nextView, new: undefined })} value={view} />
      </div>
      <div aria-label="计划工作区" className={styles.workspaceGrid} data-view={view} role="region">
        <section className={styles.viewSurface}>
          <PlanPeriodNavigator
            onDateChange={(date) => updateParameters({ date, new: undefined })}
            onManagePeriods={() => setIsPeriodManagerOpen(true)}
            onPeriodChange={selectPeriod}
            period={activePeriod}
            periods={snapshot?.periods}
            scope={scope}
            selectedDate={selectedDate}
          />
          <div className={styles.surfaceHeading}>
            <div>
              <h2>{viewNames[view]}</h2>
              <p>{scope === "semester" ? activePeriod?.name ?? "选择一个学期或假期" : selectedDate}</p>
            </div>
            <span className={styles.rangeCount}>{snapshot?.tasks.length ?? 0} 项任务</span>
          </div>
          {snapshot ? (
            isPeriodManagerOpen ? <LearningPeriodView
              onCreate={() => setEditingPeriod(undefined)}
              onDelete={setPeriodToDelete}
              onEdit={setEditingPeriod}
              onReopenMigration={(period) => { void reopenMigration(period) }}
              onSelect={(period) => { selectPeriod(period.id); setIsPeriodManagerOpen(false) }}
              periods={snapshot.periods}
              selectedPeriodId={activePeriod?.id}
            /> : scope === "day" ? <DayPlanView db={db} onCreate={openCreate} onOpen={openTask} selectedDate={selectedDate} tasks={snapshot.tasks} today={selectedDate} />
              : snapshot.periodKey ? <PlanTaskListView db={db} onCreate={openCreate} onOpen={openTask} periodKey={snapshot.periodKey} scope={scope} tasks={snapshot.tasks} />
                : <section aria-label="未选择学期或假期"><h3>选择一个学期或假期</h3><p>请从上方选择器中选择一个有效学习周期后再新建任务。</p></section>
          ) : null}
        </section>
        <PlanProgress tasks={snapshot?.tasks ?? []} view={view} />
      </div>
      <TaskEditorDialog
        db={db}
        onClose={closeEditor}
        open={Boolean(snapshot?.periodKey) && (isCreating || editorTask !== null)}
        periodKey={snapshot?.periodKey ?? ""}
        periods={snapshot?.periods ?? []}
        scope={scope}
        selectedDate={selectedDate}
        task={editorTask ?? undefined}
      />
      {actionTask ? <TaskActionsDialog
        completionError={completionError}
        completionSaving={completionSaving}
        onClose={() => setActionTask(null)}
        onDelete={() => { setDeleteTask(actionTask); setActionTask(null) }}
        onEdit={() => { setEditorTask(actionTask); setActionTask(null) }}
        onMove={() => { setEditorTask(actionTask); setActionTask(null) }}
        onRetryCompletion={() => { void toggleCompletion(actionTask.isCompleted !== 1) }}
        onStartFocus={(href) => { setActionTask(null); void navigate(href) }}
        onToggleCompletion={(nextValue) => { void toggleCompletion(nextValue) }}
        open
        task={actionTask}
      /> : null}
      {deleteTask ? <DeleteTaskDialog db={db} onClose={() => setDeleteTask(null)} open returnFocusTo={null} task={deleteTask} /> : null}
      {editingPeriod !== undefined || isPeriodManagerOpen ? <LearningPeriodDialog
        db={db}
        onClose={() => setEditingPeriod(undefined)}
        open={editingPeriod !== undefined}
        period={editingPeriod}
        periods={snapshot?.periods ?? []}
      /> : null}
      {periodToDelete ? <DeletePeriodDialog db={db} onClose={() => setPeriodToDelete(null)} onDeleted={(deletedPeriodId) => { setPeriodToDelete(null); if (periodId === deletedPeriodId) updateParameters({ period: undefined }) }} period={periodToDelete} taskCount={periodTaskCount ?? 0} /> : null}
      {migrationSource && activePeriod && migrationTasks && migrationTasks.length > 0 && !migrationDismissal ? <div className={styles.migrationBanner}><span>上一学期或假期还有 {migrationTasks.length} 个任务未完成</span><button onClick={() => setIsMigrationOpen(true)} type="button">查看并复制</button></div> : null}
      {migrationSource && activePeriod ? <PeriodMigrationPanel db={db} onClose={() => setIsMigrationOpen(false)} open={isMigrationOpen} sourcePeriod={migrationSource} targetPeriod={activePeriod} tasks={migrationTasks ?? []} today={selectedDate} /> : null}
    </main>
  )
}
