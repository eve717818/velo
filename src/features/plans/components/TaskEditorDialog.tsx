import { useRef, useState } from "react"
import type { PlanTask, PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { createPlanTask, updatePlanTask } from "../data/plan-task-service"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"
import { MultiDayTaskForm } from "./MultiDayTaskForm"
import { type RequestSession, useRequestSession } from "./useRequestSession"

interface TaskEditorDialogProps {
  db: VeloDB
  initialDate: string
  onClose: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
  task?: PlanTask
  taskGroup?: PlanTaskGroup
  initialMode?: "single" | "multi"
}

interface TaskFormValues {
  title: string
  scheduledDate: string
  subject: string
  startTime: string
  estimatedMinutes: string
  notes: string
}

type FieldErrors = Partial<Record<"title" | "scheduledDate" | "estimatedMinutes", string>>

function toTimeValue(startMinutes: number | undefined) {
  if (startMinutes === undefined) return ""
  return `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`
}

function toFormValues(task: PlanTask | undefined, initialDate: string): TaskFormValues {
  return {
    title: task?.title ?? "",
    scheduledDate: task?.scheduledDate ?? initialDate,
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

export function TaskEditorDialog({ db, initialDate, initialMode, onClose, open, returnFocusTo, task, taskGroup }: TaskEditorDialogProps) {
  const sessionKey = open ? `${task?.id ?? taskGroup?.id ?? "new"}-${task?.updatedAt ?? taskGroup?.updatedAt ?? "new"}-${initialDate}` : "closed"
  const requestSession = useRequestSession(sessionKey)

  function handleClose() {
    requestSession.invalidate()
    onClose()
  }

  return (
    <PlanDialog labelledBy="task-editor-heading" onRequestClose={handleClose} open={open} returnFocusTo={returnFocusTo}>
      <TaskEditorForm db={db} initialDate={initialDate} initialMode={initialMode} key={sessionKey} onClose={handleClose} requestSession={requestSession} task={task} taskGroup={taskGroup} />
    </PlanDialog>
  )
}

interface TaskEditorFormProps extends Omit<TaskEditorDialogProps, "open"> {
  requestSession: RequestSession
}

function TaskEditorForm({ db, initialDate, initialMode, onClose, requestSession, task, taskGroup }: TaskEditorFormProps) {
  const [mode, setMode] = useState<"single" | "multi">(() => taskGroup ? "multi" : task ? "single" : initialMode ?? "single")
  const [values, setValues] = useState(() => toFormValues(task, initialDate))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const lastInputRef = useRef<Parameters<typeof createPlanTask>[1] | null>(null)
  const headingId = "task-editor-heading"
  const modeSwitch = !task && !taskGroup ? (
    <div aria-label="任务类型" className={styles.modeSwitch} role="group">
      <button aria-pressed={mode === "single"} onClick={() => setMode("single")} type="button">单日任务</button>
      <button aria-pressed={mode === "multi"} onClick={() => setMode("multi")} type="button">跨日任务</button>
    </div>
  ) : null

  if (mode === "multi") {
    return <MultiDayTaskForm db={db} initialDate={initialDate} modeSwitch={modeSwitch} onClose={onClose} requestSession={requestSession} taskGroup={taskGroup} />
  }

  function updateValue<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === "title" || key === "scheduledDate" || key === "estimatedMinutes") {
      setErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  async function onSubmit(retryInput?: Parameters<typeof createPlanTask>[1]) {
    const input = retryInput ?? {
      title: values.title,
      scheduledDate: values.scheduledDate,
      subject: values.subject || undefined,
      startMinutes: timeToMinutes(values.startTime),
      estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
      notes: values.notes || undefined,
    }
    const nextErrors: FieldErrors = {}
    if (!input.title.trim()) nextErrors.title = "请填写任务标题"
    if (!input.scheduledDate) nextErrors.scheduledDate = "请选择日期"
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
      if (task) {
        await updatePlanTask(db, task.id, input, Date.now())
      } else {
        await createPlanTask(db, input, Date.now())
      }
      if (!requestSession.isCurrent(requestToken)) return
      onClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      setSaveError(error instanceof Error ? error.message : "保存任务失败，请重试")
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  return (
    <>
      <form aria-busy={isSaving} className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); void onSubmit() }}>
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>学习计划</p>
            <h2 id={headingId}>{task ? "编辑学习任务" : "新建学习任务"}</h2>
          </div>
          <button aria-label="关闭任务编辑" className={styles.iconButton} onClick={onClose} type="button">×</button>
        </div>
        {modeSwitch}

        <label className={styles.field} htmlFor="task-title">
          <span>任务标题 <em>必填</em></span>
          <input
            aria-label="任务标题"
            aria-required="true"
            aria-describedby={errors.title ? "task-title-error" : undefined}
            aria-invalid={Boolean(errors.title)}
            id="task-title"
            onChange={(event) => updateValue("title", event.target.value)}
            value={values.title}
          />
          {errors.title ? <small id="task-title-error" role="alert">{errors.title}</small> : null}
        </label>

        <div className={styles.fieldGrid}>
          <label className={styles.field} htmlFor="task-date">
            <span>日期 <em>必填</em></span>
            <input
              aria-label="日期"
              aria-required="true"
              aria-describedby={errors.scheduledDate ? "task-date-error" : undefined}
              aria-invalid={Boolean(errors.scheduledDate)}
              id="task-date"
              onChange={(event) => updateValue("scheduledDate", event.target.value)}
              type="date"
              value={values.scheduledDate}
            />
            {errors.scheduledDate ? <small id="task-date-error" role="alert">{errors.scheduledDate}</small> : null}
          </label>
          <label className={styles.field} htmlFor="task-start-time">
            <span>开始时间</span>
            <input id="task-start-time" onChange={(event) => updateValue("startTime", event.target.value)} type="time" value={values.startTime} />
          </label>
        </div>

        <label className={styles.field} htmlFor="task-subject">
          <span>科目</span>
          <input id="task-subject" onChange={(event) => updateValue("subject", event.target.value)} value={values.subject} />
        </label>
        <label className={styles.field} htmlFor="task-estimate">
          <span>预计时长（分钟）</span>
          <input aria-describedby={errors.estimatedMinutes ? "task-estimate-error" : undefined} aria-invalid={Boolean(errors.estimatedMinutes)} id="task-estimate" min="1" onChange={(event) => updateValue("estimatedMinutes", event.target.value)} step="1" type="number" value={values.estimatedMinutes} />
          {errors.estimatedMinutes ? <small id="task-estimate-error" role="alert">{errors.estimatedMinutes}</small> : null}
        </label>
        <label className={styles.field} htmlFor="task-notes">
          <span>备注</span>
          <textarea id="task-notes" onChange={(event) => updateValue("notes", event.target.value)} rows={3} value={values.notes} />
        </label>

        <div className={styles.actions}>
          {saveError ? <PlanErrorState error={saveError} onRetry={() => { if (lastInputRef.current) void onSubmit(lastInputRef.current) }} /> : null}
          <button className={styles.secondaryButton} onClick={onClose} type="button">取消</button>
          <button className={styles.primaryButton} disabled={isSaving} type="submit">{isSaving ? "正在保存" : "保存任务"}</button>
        </div>
      </form>
    </>
  )
}
