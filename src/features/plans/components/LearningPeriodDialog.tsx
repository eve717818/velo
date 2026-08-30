import { useRef, useState } from "react"

import type { LearningPeriod, LearningPeriodKind } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { LearningPeriodValidationError, createLearningPeriod, updateLearningPeriod } from "../data/learning-period-service"
import type { LearningPeriodInput } from "../domain/learning-periods"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"
import { useRequestSession } from "./useRequestSession"

type FieldName = "name" | "startDate" | "endDate"
type FieldErrors = Partial<Record<FieldName, string>>

interface LearningPeriodDialogProps {
  db: VeloDB
  onClose: () => void
  open: boolean
  period?: LearningPeriod
  periods: LearningPeriod[]
}

function toFormValues(period?: LearningPeriod): LearningPeriodInput {
  return {
    kind: period?.kind ?? "semester",
    name: period?.name ?? "",
    startDate: period?.startDate ?? "",
    endDate: period?.endDate ?? "",
    goal: period?.goal ?? "",
  }
}

function conflictingPeriodName(input: LearningPeriodInput, periods: LearningPeriod[], editedId?: string) {
  return periods.find((period) => period.id !== editedId && input.startDate <= period.endDate && input.endDate >= period.startDate)?.name
}

export function LearningPeriodDialog({ db, onClose, open, period, periods }: LearningPeriodDialogProps) {
  const sessionKey = open ? `${period?.id ?? "new"}-${period?.updatedAt ?? "new"}` : "closed"
  return (
    <PlanDialog labelledBy="learning-period-editor-heading" onRequestClose={onClose} open={open}>
      <LearningPeriodForm db={db} key={sessionKey} onClose={onClose} period={period} periods={periods} />
    </PlanDialog>
  )
}

function LearningPeriodForm({ db, onClose, period, periods }: Omit<LearningPeriodDialogProps, "open">) {
  const [values, setValues] = useState(() => toFormValues(period))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState("")
  const [saving, setSaving] = useState(false)
  const lastValuesRef = useRef<LearningPeriodInput | null>(null)
  const requestSession = useRequestSession()

  function setValue<K extends keyof LearningPeriodInput>(key: K, value: LearningPeriodInput[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === "name" || key === "startDate" || key === "endDate") setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function requestClose() {
    requestSession.invalidate()
    onClose()
  }

  async function submit(retryValues?: LearningPeriodInput) {
    const submittedValues = retryValues ?? values
    const requestToken = requestSession.beginRequest()
    setSaving(true)
    setSaveError("")
    setErrors({})
    lastValuesRef.current = submittedValues
    try {
      if (period) await updateLearningPeriod(db, period.id, submittedValues, Date.now())
      else await createLearningPeriod(db, submittedValues, Date.now())
      if (!requestSession.isCurrent(requestToken)) return
      requestClose()
    } catch (error) {
      if (!requestSession.isCurrent(requestToken)) return
      if (error instanceof LearningPeriodValidationError) {
        const conflict = error.field === "startDate" ? conflictingPeriodName(submittedValues, periods, period?.id) : undefined
        setErrors({ [error.field]: conflict ? `${error.message}：${conflict}` : error.message })
      } else {
        setSaveError(error instanceof Error ? error.message : "保存周期失败，请重试")
      }
    } finally {
      if (requestSession.isCurrent(requestToken)) setSaving(false)
    }
  }

  return (
    <form aria-busy={saving} className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className={styles.dialogHeader}>
        <div><p className={styles.eyebrow}>学习周期</p><h2 id="learning-period-editor-heading">{period ? "编辑学习周期" : "新建学习周期"}</h2></div>
        <button aria-label="关闭周期编辑" className={styles.iconButton} onClick={requestClose} type="button">×</button>
      </div>
      <label className={styles.field} htmlFor="period-kind"><span>周期类型</span><select aria-label="周期类型" id="period-kind" onChange={(event) => setValue("kind", event.target.value as LearningPeriodKind)} value={values.kind}><option value="semester">学期</option><option value="winter-break">寒假</option><option value="summer-break">暑假</option><option value="custom-break">自定义假期</option></select></label>
      <label className={styles.field} htmlFor="period-name"><span>周期名称 <em>必填</em></span><input aria-invalid={Boolean(errors.name)} aria-label="周期名称" id="period-name" onChange={(event) => setValue("name", event.target.value)} value={values.name} />{errors.name ? <small role="alert">{errors.name}</small> : null}</label>
      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor="period-start"><span>开始日期 <em>必填</em></span><input aria-invalid={Boolean(errors.startDate)} aria-label="开始日期" id="period-start" onChange={(event) => setValue("startDate", event.target.value)} type="date" value={values.startDate} />{errors.startDate ? <small role="alert">{errors.startDate}</small> : null}</label>
        <label className={styles.field} htmlFor="period-end"><span>结束日期 <em>必填</em></span><input aria-invalid={Boolean(errors.endDate)} aria-label="结束日期" id="period-end" onChange={(event) => setValue("endDate", event.target.value)} type="date" value={values.endDate} />{errors.endDate ? <small role="alert">{errors.endDate}</small> : null}</label>
      </div>
      <label className={styles.field} htmlFor="period-goal"><span>学习目标 <em>可选</em></span><textarea aria-label="学习目标" id="period-goal" onChange={(event) => setValue("goal", event.target.value)} rows={3} value={values.goal} /></label>
      <div className={styles.actions}>{saveError ? <PlanErrorState error={saveError} onRetry={() => { if (lastValuesRef.current) void submit(lastValuesRef.current) }} /> : null}<button className={styles.secondaryButton} onClick={requestClose} type="button">取消</button><button className={styles.primaryButton} disabled={saving} type="submit">{saving ? "正在保存" : "保存周期"}</button></div>
    </form>
  )
}
