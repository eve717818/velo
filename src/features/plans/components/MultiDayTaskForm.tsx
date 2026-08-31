import { useMemo, useRef, useState, type ReactNode } from "react"
import { useLiveQuery } from "dexie-react-hooks"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import {
  createPlanTaskGroup,
  type CreatePlanTaskGroupInput,
  updatePlanTaskGroup,
} from "../data/plan-task-group-service"
import { buildMultiDaySchedule } from "../domain/multiday-schedule"
import { addLocalDays, parseLocalDate } from "../domain/plan-dates"
import styles from "./PlanDialog.module.css"
import { PlanErrorState } from "./PlanErrorState"
import { SchedulePreview, type SchedulePreviewStep } from "./SchedulePreview"
import type { RequestSession } from "./useRequestSession"

interface MultiDayTaskFormProps {
  db: VeloDB
  initialDate: string
  modeSwitch?: ReactNode
  onClose: () => void
  requestSession: RequestSession
  taskGroup?: PlanTaskGroup
}

interface MultiDayValues {
  title: string
  subject: string
  startDate: string
  endDate: string
  sessionCount: string
  estimatedMinutes: string
  notes: string
}

interface MultiDayErrors {
  title?: string
  range?: string
  sessionCount?: string
  estimatedMinutes?: string
  removal?: string
  stepDates: Record<number, string>
  stepTitles: Record<number, string>
}

const emptyErrors: MultiDayErrors = { stepDates: {}, stepTitles: {} }

export function MultiDayTaskForm({ db, initialDate, modeSwitch, onClose, requestSession, taskGroup }: MultiDayTaskFormProps) {
  const [values, setValues] = useState<MultiDayValues>(() => ({
    title: taskGroup?.title ?? "",
    subject: taskGroup?.subject ?? "",
    startDate: taskGroup?.startDate ?? initialDate,
    endDate: taskGroup?.endDate ?? initialDate,
    sessionCount: taskGroup?.sessionCount.toString() ?? "1",
    estimatedMinutes: taskGroup?.estimatedMinutes?.toString() ?? "",
    notes: taskGroup?.notes ?? "",
  }))
  const [stepEdits, setStepEdits] = useState<Record<number, Partial<SchedulePreviewStep>>>({})
  const [errors, setErrors] = useState<MultiDayErrors>(emptyErrors)
  const [saveError, setSaveError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const lastInputRef = useRef<CreatePlanTaskGroupInput | null>(null)
  const data = useLiveQuery(async () => {
    const allTasks = await db.planTasks.toArray()
    const groupTasks = taskGroup
      ? await db.planTasks.where("groupId").equals(taskGroup.id).toArray()
      : []
    return { allTasks, groupTasks }
  }, [db, taskGroup?.id])
  const groupTasks = useMemo(
    () => [...(data?.groupTasks ?? [])].sort((left, right) => (left.stepIndex ?? 0) - (right.stepIndex ?? 0)),
    [data?.groupTasks],
  )
  const otherTasks = useMemo(
    () => taskGroup
      ? (data?.allTasks ?? []).filter((task) => task.groupId !== taskGroup.id)
      : (data?.allTasks ?? []),
    [data?.allTasks, taskGroup],
  )

  const suggestedSteps = useMemo<SchedulePreviewStep[]>(() => {
    const count = Number(values.sessionCount)
    try {
      const drafts = buildMultiDaySchedule(
        {
          startDate: values.startDate,
          endDate: values.endDate,
          sessionCount: count,
          estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
        },
        otherTasks,
      )
      return drafts.map((draft) => {
        const existing = groupTasks.find((task) => task.stepIndex === draft.stepIndex)
        return {
          ...draft,
          scheduledDate: existing?.isCompleted === 1 ? existing.scheduledDate : draft.scheduledDate,
          title:
            existing?.stepTitleMode === "custom" || existing?.isCompleted === 1
              ? existing.title
              : values.title,
          stepTitleMode: existing?.stepTitleMode === "custom" ? "custom" : "inherit",
          isCompleted: existing?.isCompleted === 1,
        }
      })
    } catch {
      return []
    }
  }, [groupTasks, otherTasks, values.endDate, values.estimatedMinutes, values.sessionCount, values.startDate, values.title])
  const steps = useMemo(
    () => suggestedSteps.map((step) => ({ ...step, ...stepEdits[step.stepIndex] })),
    [stepEdits, suggestedSteps],
  )

  const immediateRangeError = getRangeError(values.startDate, values.endDate)
  const immediateCountError = getCountError(values.startDate, values.endDate, values.sessionCount)
  const omittedTasks = groupTasks.filter(
    (task) => !steps.some((step) => step.stepIndex === task.stepIndex),
  )
  const removableTasks = omittedTasks.filter((task) => task.isCompleted === 0)

  function updateValue<K extends keyof MultiDayValues>(key: K, value: MultiDayValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setSaveError("")
    setErrors((current) => ({
      ...current,
      title: key === "title" ? undefined : current.title,
      range: key === "startDate" || key === "endDate" ? undefined : current.range,
      sessionCount: key === "sessionCount" ? undefined : current.sessionCount,
      estimatedMinutes: key === "estimatedMinutes" ? undefined : current.estimatedMinutes,
      stepDates: key === "startDate" || key === "endDate" || key === "sessionCount" ? {} : current.stepDates,
    }))
    if (key === "sessionCount") setConfirmRemoval(false)
  }

  function updateStep(stepIndex: number, changes: Partial<SchedulePreviewStep>) {
    setStepEdits((current) => ({
      ...current,
      [stepIndex]: { ...current[stepIndex], ...changes },
    }))
    setErrors((current) => ({
      ...current,
      stepDates: { ...current.stepDates, [stepIndex]: "" },
      stepTitles: { ...current.stepTitles, [stepIndex]: "" },
    }))
  }

  function buildInput(): CreatePlanTaskGroupInput | null {
    const nextErrors = validate(values, steps, omittedTasks, confirmRemoval)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return null

    return {
      title: values.title,
      subject: values.subject || undefined,
      notes: values.notes || undefined,
      startDate: values.startDate,
      endDate: values.endDate,
      sessionCount: Number(values.sessionCount),
      estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
      steps: steps.map((step) => ({
        scheduledDate: step.scheduledDate,
        stepIndex: step.stepIndex,
        stepTitleMode: step.stepTitleMode,
        title: step.title,
      })),
      confirmedRemovedStepIds: removableTasks.map((task) => task.id),
    }
  }

  async function submit(retryInput?: CreatePlanTaskGroupInput) {
    const input = retryInput ?? buildInput()
    if (!input) return

    setIsSaving(true)
    setSaveError("")
    lastInputRef.current = input
    const requestToken = requestSession.beginRequest()
    try {
      if (taskGroup) {
        await updatePlanTaskGroup(db, taskGroup.id, input, Date.now())
      } else {
        await createPlanTaskGroup(db, input, Date.now())
      }
      if (requestSession.isCurrent(requestToken)) onClose()
    } catch (error) {
      if (requestSession.isCurrent(requestToken)) {
        setSaveError(error instanceof Error ? error.message : "保存跨日任务失败")
      }
    } finally {
      if (requestSession.isCurrent(requestToken)) setIsSaving(false)
    }
  }

  return (
    <form aria-busy={isSaving} className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className={styles.dialogHeader}>
        <div>
          <p className={styles.eyebrow}>学习计划</p>
          <h2 id="task-editor-heading">{taskGroup ? "编辑跨日任务" : "新建学习任务"}</h2>
        </div>
        <button aria-label="关闭任务编辑" className={styles.iconButton} onClick={onClose} type="button">×</button>
      </div>
      {modeSwitch}

      <label className={styles.field} htmlFor="multi-task-title">
        <span>任务名称 <em>必填</em></span>
        <input
          aria-label="任务名称"
          aria-describedby={errors.title ? "multi-task-title-error" : undefined}
          aria-invalid={Boolean(errors.title)}
          aria-required="true"
          id="multi-task-title"
          onChange={(event) => updateValue("title", event.target.value)}
          value={values.title}
        />
        {errors.title ? <small id="multi-task-title-error" role="alert">{errors.title}</small> : null}
      </label>

      <label className={styles.field} htmlFor="multi-task-subject">
        <span>科目</span>
        <input id="multi-task-subject" onChange={(event) => updateValue("subject", event.target.value)} value={values.subject} />
      </label>

      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor="multi-task-start-date">
          <span>开始日期 <em>必填</em></span>
          <input aria-label="开始日期" aria-describedby={immediateRangeError ? "multi-task-range-error" : undefined} aria-invalid={Boolean(immediateRangeError)} aria-required="true" id="multi-task-start-date" onChange={(event) => updateValue("startDate", event.target.value)} type="date" value={values.startDate} />
        </label>
        <label className={styles.field} htmlFor="multi-task-end-date">
          <span>截止日期 <em>必填</em></span>
          <input aria-label="截止日期" aria-describedby={immediateRangeError ? "multi-task-range-error" : undefined} aria-invalid={Boolean(immediateRangeError)} aria-required="true" id="multi-task-end-date" onChange={(event) => updateValue("endDate", event.target.value)} type="date" value={values.endDate} />
        </label>
      </div>
      {immediateRangeError ? <small className={styles.rangeError} id="multi-task-range-error" role="alert">{immediateRangeError}</small> : null}

      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor="multi-task-session-count">
          <span>学习次数 <em>必填</em></span>
          <input aria-label="学习次数" aria-describedby={immediateCountError || errors.sessionCount ? "multi-task-count-error" : undefined} aria-invalid={Boolean(immediateCountError || errors.sessionCount)} aria-required="true" id="multi-task-session-count" min="1" onChange={(event) => updateValue("sessionCount", event.target.value)} step="1" type="number" value={values.sessionCount} />
          {immediateCountError || errors.sessionCount ? <small id="multi-task-count-error" role="alert">{immediateCountError ?? errors.sessionCount}</small> : null}
        </label>
        <label className={styles.field} htmlFor="multi-task-estimate">
          <span>单次预计时长（分钟）</span>
          <input aria-describedby={errors.estimatedMinutes ? "multi-task-estimate-error" : undefined} aria-invalid={Boolean(errors.estimatedMinutes)} id="multi-task-estimate" min="1" onChange={(event) => updateValue("estimatedMinutes", event.target.value)} step="1" type="number" value={values.estimatedMinutes} />
          {errors.estimatedMinutes ? <small id="multi-task-estimate-error" role="alert">{errors.estimatedMinutes}</small> : null}
        </label>
      </div>

      <label className={styles.field} htmlFor="multi-task-notes">
        <span>总体备注</span>
        <textarea id="multi-task-notes" onChange={(event) => updateValue("notes", event.target.value)} rows={3} value={values.notes} />
      </label>

      <SchedulePreview allTasks={otherTasks} dateErrors={errors.stepDates} onChange={updateStep} steps={steps} titleErrors={errors.stepTitles} />

      {removableTasks.length > 0 ? (
        <label className={styles.confirmRemoval}>
          <input checked={confirmRemoval} onChange={(event) => setConfirmRemoval(event.target.checked)} type="checkbox" />
          <span>确认删除 {removableTasks.length} 个未完成步骤</span>
        </label>
      ) : null}
      {errors.removal ? <small className={styles.rangeError} role="alert">{errors.removal}</small> : null}

      <div className={styles.actions}>
        {saveError ? <PlanErrorState error={saveError} onRetry={() => { if (lastInputRef.current) void submit(lastInputRef.current) }} /> : null}
        <button className={styles.secondaryButton} onClick={onClose} type="button">取消</button>
        <button className={styles.primaryButton} disabled={isSaving} type="submit">{isSaving ? "正在保存" : "保存跨日任务"}</button>
      </div>
    </form>
  )
}

function validate(
  values: MultiDayValues,
  steps: SchedulePreviewStep[],
  omittedTasks: PlanTask[],
  confirmRemoval: boolean,
): MultiDayErrors {
  const next: MultiDayErrors = { stepDates: {}, stepTitles: {} }
  if (!values.title.trim()) next.title = "请填写任务名称"
  next.range = getRangeError(values.startDate, values.endDate)
  next.sessionCount = getCountError(values.startDate, values.endDate, values.sessionCount)
  const estimate = values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined
  if (estimate !== undefined && (!Number.isInteger(estimate) || estimate <= 0)) {
    next.estimatedMinutes = "预计时长必须是正整数"
  }
  if (!next.range && !next.sessionCount && steps.length !== Number(values.sessionCount)) {
    next.sessionCount = "请先生成完整排期"
  }

  const dates = new Set<string>()
  for (const step of steps) {
    if (!step.title.trim()) next.stepTitles[step.stepIndex] = "请填写本次学习内容"
    if (!step.scheduledDate || step.scheduledDate < values.startDate || step.scheduledDate > values.endDate) {
      next.stepDates[step.stepIndex] = "步骤日期必须在任务周期内"
    } else if (dates.has(step.scheduledDate)) {
      next.stepDates[step.stepIndex] = "同一天不能安排两次该任务"
    }
    dates.add(step.scheduledDate)
  }

  if (omittedTasks.some((task) => task.isCompleted === 1)) {
    next.removal = "不能删除已完成的学习步骤"
  } else if (omittedTasks.length > 0 && !confirmRemoval) {
    next.removal = "请确认删除减少的未完成步骤"
  }
  return next
}

function getRangeError(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "请选择开始日期和截止日期"
  try {
    parseLocalDate(startDate)
    parseLocalDate(endDate)
  } catch {
    return "任务日期无效"
  }
  return startDate > endDate ? "开始日期不能晚于截止日期" : undefined
}

function getCountError(startDate: string, endDate: string, countValue: string) {
  const count = Number(countValue)
  if (!Number.isInteger(count) || count < 1) return "学习次数必须是正整数"
  if (getRangeError(startDate, endDate)) return undefined
  let days = 0
  for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) days += 1
  return count > days ? "学习次数不能超过周期天数" : undefined
}

function hasErrors(errors: MultiDayErrors) {
  return Boolean(
    errors.title ||
    errors.range ||
    errors.sessionCount ||
    errors.estimatedMinutes ||
    errors.removal ||
    Object.values(errors.stepDates).some(Boolean) ||
    Object.values(errors.stepTitles).some(Boolean)
  )
}
