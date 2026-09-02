import { useRef, useState } from "react"
import type { LearningPeriod, PlanTask, PlanTaskScope } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { getWeekDates } from "../domain/plan-dates"
import { createPlanTask, type CreatePlanTaskInput, updatePlanTask } from "../data/plan-task-service"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"
import { type RequestSession, useRequestSession } from "./useRequestSession"

export interface TaskEditorDialogProps {
  db: VeloDB
  open: boolean
  scope: PlanTaskScope
  periodKey: string
  selectedDate: string
  periods: LearningPeriod[]
  task?: PlanTask
  returnFocusTo?: HTMLElement | null
  onClose: () => void
}

interface TaskFormValues {
  title: string
  periodKey: string
  subject: string
  startTime: string
  estimatedMinutes: string
  notes: string
}

type FieldErrors = Partial<Record<"title" | "periodKey" | "estimatedMinutes", string>>

function toTimeValue(startMinutes: number | undefined) {
  if (startMinutes === undefined) return ""
  return `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`
}

function toWeekInput(periodKey: string) {
  const monday = new Date(`${periodKey}T12:00:00`)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const isoYear = thursday.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4, 12)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000)
  return `${isoYear}-W${String(week).padStart(2, "0")}`
}

function weekInputToMonday(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value)
  if (!match) return ""
  const [, year, week] = match
  const firstWeekMonday = getWeekDates(`${year}-01-04`)[0]
  const monday = new Date(`${firstWeekMonday}T12:00:00`)
  monday.setDate(monday.getDate() + (Number(week) - 1) * 7)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
}

function toFormValues(task: PlanTask | undefined, scope: PlanTaskScope, periodKey: string, selectedDate: string): TaskFormValues {
  const taskPeriodKey = task?.periodKey ?? (periodKey || selectedDate)
  return {
    title: task?.title ?? "",
    periodKey: scope === "week" ? toWeekInput(taskPeriodKey) : taskPeriodKey,
    subject: task?.subject ?? "",
    startTime: toTimeValue(task?.startMinutes),
    estimatedMinutes: task?.estimatedMinutes?.toString() ?? "",
    notes: task?.notes ?? "",
  }
}

function timeToMinutes(value: string) {
  if (!value) return undefined
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

export function TaskEditorDialog({ db, onClose, open, periodKey, periods, returnFocusTo, scope, selectedDate, task }: TaskEditorDialogProps) {
  const editorScope = task?.scope ?? scope
  const editorPeriodKey = task?.periodKey ?? periodKey
  const sessionKey = open ? `${task?.id ?? "new"}-${task?.updatedAt ?? "new"}-${editorScope}-${editorPeriodKey}-${selectedDate}` : "closed"
  const requestSession = useRequestSession(sessionKey)

  function handleClose() {
    requestSession.invalidate()
    onClose()
  }

  return (
    <PlanDialog labelledBy="task-editor-heading" onRequestClose={handleClose} open={open} returnFocusTo={returnFocusTo}>
      <TaskEditorForm db={db} key={sessionKey} onClose={handleClose} periodKey={editorPeriodKey} periods={periods} requestSession={requestSession} scope={editorScope} selectedDate={selectedDate} task={task} />
    </PlanDialog>
  )
}

interface TaskEditorFormProps extends Omit<TaskEditorDialogProps, "open" | "returnFocusTo"> {
  requestSession: RequestSession
}

function TaskEditorForm({ db, onClose, periodKey, periods, requestSession, scope, selectedDate, task }: TaskEditorFormProps) {
  const [values, setValues] = useState(() => toFormValues(task, scope, periodKey, selectedDate))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const lastInputRef = useRef<CreatePlanTaskInput | null>(null)

  function updateValue<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === "title" || key === "periodKey" || key === "estimatedMinutes") {
      setErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  function toTaskInput(): CreatePlanTaskInput {
    return {
      title: values.title,
      scope,
      periodKey: scope === "week" ? weekInputToMonday(values.periodKey) : values.periodKey,
      subject: values.subject || undefined,
      startMinutes: scope === "day" ? timeToMinutes(values.startTime) : undefined,
      estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
      notes: values.notes || undefined,
    }
  }

  async function onSubmit(retryInput?: CreatePlanTaskInput) {
    const input = retryInput ?? toTaskInput()
    const nextErrors: FieldErrors = {}
    if (!input.title.trim()) nextErrors.title = "请填写任务标题"
    if (!input.periodKey) nextErrors.periodKey = scope === "semester" ? "请选择有效的学期或假期" : "请选择周期"
    if (scope === "semester" && !periods.some((period) => period.id === input.periodKey)) {
      nextErrors.periodKey = "请选择有效的学期或假期"
    }
    if (input.estimatedMinutes !== undefined && (!Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes <= 0)) {
      nextErrors.estimatedMinutes = "预计时长必须大于 0"
    } else if (input.estimatedMinutes !== undefined && !Number.isInteger(input.estimatedMinutes)) {
      nextErrors.estimatedMinutes = "预计时长必须是正整数"
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    setSaveError("")
    lastInputRef.current = input
    const requestToken = requestSession.beginRequest()

    try {
      if (task) await updatePlanTask(db, task.id, input, Date.now())
      else await createPlanTask(db, input, Date.now())
      if (!requestSession.isCurrent(requestToken)) return
      onClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      setSaveError(error instanceof Error ? error.message : "保存任务失败，请重试")
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  const periodField = scope === "day" ? (
    <div className={styles.fieldGrid}>
      <label className={styles.field} htmlFor="task-date">
        <span>日期 <em>必填</em></span>
        <input aria-label="日期" aria-required="true" aria-describedby={errors.periodKey ? "task-period-error" : undefined} aria-invalid={Boolean(errors.periodKey)} id="task-date" onChange={(event) => updateValue("periodKey", event.target.value)} type="date" value={values.periodKey} />
        {errors.periodKey ? <small id="task-period-error" role="alert">{errors.periodKey}</small> : null}
      </label>
      <label className={styles.field} htmlFor="task-start-time">
        <span>开始时间</span>
        <input aria-label="开始时间" id="task-start-time" onChange={(event) => updateValue("startTime", event.target.value)} type="time" value={values.startTime} />
      </label>
    </div>
  ) : (
    <label className={styles.field} htmlFor="task-period-key">
      <span>{scope === "week" ? "所属周" : scope === "month" ? "所属月" : "所属学期或假期"} <em>必填</em></span>
      {scope === "semester" ? (
        <select aria-label="所属学期或假期" aria-required="true" aria-describedby={errors.periodKey ? "task-period-error" : undefined} aria-invalid={Boolean(errors.periodKey)} id="task-period-key" onChange={(event) => updateValue("periodKey", event.target.value)} value={values.periodKey}>
          <option disabled value="">选择学期或假期</option>
          {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </select>
      ) : (
        <input aria-label={scope === "week" ? "所属周" : "所属月"} aria-required="true" aria-describedby={errors.periodKey ? "task-period-error" : undefined} aria-invalid={Boolean(errors.periodKey)} id="task-period-key" onChange={(event) => updateValue("periodKey", event.target.value)} type={scope === "week" ? "week" : "month"} value={values.periodKey} />
      )}
      {errors.periodKey ? <small id="task-period-error" role="alert">{errors.periodKey}</small> : null}
    </label>
  )

  return (
    <form aria-busy={isSaving} className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); void onSubmit() }}>
      <div className={styles.dialogHeader}>
        <div>
          <p className={styles.eyebrow}>学习计划</p>
          <h2 id="task-editor-heading">{task ? "编辑学习任务" : "新建学习任务"}</h2>
        </div>
        <button aria-label="关闭任务编辑" className={styles.iconButton} onClick={onClose} type="button">×</button>
      </div>

      <label className={styles.field} htmlFor="task-title">
        <span>任务标题 <em>必填</em></span>
        <input aria-label="任务标题" aria-required="true" aria-describedby={errors.title ? "task-title-error" : undefined} aria-invalid={Boolean(errors.title)} id="task-title" onChange={(event) => updateValue("title", event.target.value)} value={values.title} />
        {errors.title ? <small id="task-title-error" role="alert">{errors.title}</small> : null}
      </label>

      {periodField}

      <label className={styles.field} htmlFor="task-subject">
        <span>科目</span>
        <input aria-label="科目" id="task-subject" onChange={(event) => updateValue("subject", event.target.value)} value={values.subject} />
      </label>
      <label className={styles.field} htmlFor="task-estimate">
        <span>预计时长（分钟）</span>
        <input aria-label="预计时长（分钟）" aria-describedby={errors.estimatedMinutes ? "task-estimate-error" : undefined} aria-invalid={Boolean(errors.estimatedMinutes)} id="task-estimate" min="1" onChange={(event) => updateValue("estimatedMinutes", event.target.value)} step="1" type="number" value={values.estimatedMinutes} />
        {errors.estimatedMinutes ? <small id="task-estimate-error" role="alert">{errors.estimatedMinutes}</small> : null}
      </label>
      <label className={styles.field} htmlFor="task-notes">
        <span>备注</span>
        <textarea aria-label="备注" id="task-notes" onChange={(event) => updateValue("notes", event.target.value)} rows={3} value={values.notes} />
      </label>

      <div className={styles.actions}>
        {saveError ? <PlanErrorState error={saveError} onRetry={() => { if (lastInputRef.current) void onSubmit(lastInputRef.current) }} /> : null}
        <button className={styles.secondaryButton} onClick={onClose} type="button">取消</button>
        <button className={styles.primaryButton} disabled={isSaving} type="submit">{isSaving ? "正在保存" : "保存任务"}</button>
      </div>
    </form>
  )
}
