import { Plus, Trash2 } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import type { RangePlan, RangePlanKind } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { RangePlanValidationError, saveRangePlan } from "../data/range-plan-service"
import type { RangePlanInput } from "../domain/range-plans"
import styles from "./PlanDialog.module.css"
import { PlanDialog } from "./PlanDialog"
import { PlanErrorState } from "./PlanErrorState"
import { useRequestSession } from "./useRequestSession"

interface RangePlanDrawerProps {
  completed: number
  db: VeloDB
  kind: RangePlanKind
  onClose: () => void
  open: boolean
  plan: RangePlan | null
  returnFocusTo?: HTMLElement | null
  selectedDate: string
  total: number
}

type FieldErrors = Partial<Record<keyof RangePlanInput, string>>

function initialValues(plan: RangePlan | null): RangePlanInput {
  return {
    theme: plan?.theme ?? "",
    goal: plan?.goal ?? "",
    focusItems: plan?.focusItems.length ? plan.focusItems : [""],
    note: plan?.note ?? "",
  }
}

export function RangePlanDrawer(props: RangePlanDrawerProps) {
  const sessionKey = props.open ? `${props.kind}-${props.plan?.updatedAt ?? "new"}-${props.selectedDate}` : "closed"
  return (
    <PlanDialog labelledBy="range-plan-heading" onRequestClose={props.onClose} open={props.open} returnFocusTo={props.returnFocusTo}>
      <RangePlanForm {...props} key={sessionKey} />
    </PlanDialog>
  )
}

function RangePlanForm({ completed, db, kind, onClose, plan, selectedDate, total }: RangePlanDrawerProps) {
  const [values, setValues] = useState(() => initialValues(plan))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestSession = useRequestSession()
  const initial = useMemo(() => JSON.stringify(initialValues(plan)), [plan])
  const lastValues = useRef<RangePlanInput | null>(null)
  const rangeName = kind === "week" ? "本周" : "本月"
  const dirty = JSON.stringify(values) !== initial

  function requestClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    requestSession.invalidate()
    onClose()
  }

  function setValue<K extends keyof RangePlanInput>(key: K, value: RangePlanInput[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  async function submit(retryValues?: RangePlanInput) {
    const submitted = retryValues ?? values
    const token = requestSession.beginRequest()
    setSaving(true)
    setErrors({})
    setSaveError("")
    lastValues.current = submitted
    try {
      await saveRangePlan(db, kind, selectedDate, submitted, Date.now())
      if (requestSession.isCurrent(token)) onClose()
    } catch (error) {
      if (!requestSession.isCurrent(token)) return
      if (error instanceof RangePlanValidationError) setErrors({ [error.field]: error.message })
      else setSaveError(error instanceof Error ? error.message : "保存计划失败，请重试")
    } finally {
      if (requestSession.isCurrent(token)) setSaving(false)
    }
  }

  if (confirmDiscard) {
    return (
      <section className={styles.confirmationDialog}>
        <p className={styles.eyebrow}>{rangeName}总计划</p>
        <h2 id="range-plan-heading">放弃未保存的修改？</h2>
        <p>关闭后，本次修改不会保留。</p>
        <div className={styles.actions}>
          <button className={styles.secondaryButton} onClick={() => setConfirmDiscard(false)} type="button">继续编辑</button>
          <button className={styles.dangerButton} onClick={onClose} type="button">放弃修改</button>
        </div>
      </section>
    )
  }

  return (
    <form aria-busy={saving} className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className={styles.dialogHeader}>
        <div><p className={styles.eyebrow}>{rangeName}总计划</p><h2 id="range-plan-heading">{plan ? `编辑${rangeName}计划` : `制定${rangeName}计划`}</h2></div>
        <button aria-label="关闭总计划设置" className={styles.iconButton} onClick={requestClose} type="button">×</button>
      </div>
      <p className={styles.rangeTaskSummary}>{rangeName}任务 {total} 项 · 已完成 {completed} 项</p>
      <label className={styles.field} htmlFor="range-theme"><span>计划主题 <em>必填</em></span><input aria-describedby={errors.theme ? "range-theme-error" : undefined} aria-invalid={Boolean(errors.theme)} aria-label="计划主题" id="range-theme" onChange={(event) => setValue("theme", event.target.value)} value={values.theme} />{errors.theme ? <small id="range-theme-error" role="alert">{errors.theme}</small> : null}</label>
      <label className={styles.field} htmlFor="range-goal"><span>总体目标 <em>必填</em></span><textarea aria-describedby={errors.goal ? "range-goal-error" : undefined} aria-invalid={Boolean(errors.goal)} aria-label="总体目标" id="range-goal" onChange={(event) => setValue("goal", event.target.value)} rows={3} value={values.goal} />{errors.goal ? <small id="range-goal-error" role="alert">{errors.goal}</small> : null}</label>
      <fieldset className={styles.focusFieldset}>
        <legend>重点事项 <span>{values.focusItems.length}/5</span></legend>
        {values.focusItems.map((item, index) => (
          <div className={styles.focusItemRow} key={index}>
            <input aria-label={`重点事项 ${index + 1}`} onChange={(event) => setValue("focusItems", values.focusItems.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} value={item} />
            {values.focusItems.length > 1 ? <button aria-label={`删除重点事项 ${index + 1}`} className={styles.removeFocusButton} onClick={() => setValue("focusItems", values.focusItems.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 aria-hidden size={16} /></button> : null}
          </div>
        ))}
        {errors.focusItems ? <small role="alert">{errors.focusItems}</small> : null}
        {values.focusItems.length < 5 ? <button className={styles.addFocusButton} onClick={() => setValue("focusItems", [...values.focusItems, ""])} type="button"><Plus aria-hidden size={16} />添加重点事项</button> : null}
      </fieldset>
      <label className={styles.field} htmlFor="range-note"><span>备注 <em>可选</em></span><textarea aria-label="备注" id="range-note" onChange={(event) => setValue("note", event.target.value)} rows={3} value={values.note} /></label>
      {saveError ? <PlanErrorState error={saveError} onRetry={() => { if (lastValues.current) void submit(lastValues.current) }} /> : null}
      <div className={styles.actions}><button className={styles.secondaryButton} onClick={requestClose} type="button">取消</button><button className={styles.primaryButton} disabled={saving} type="submit">{saving ? "正在保存" : `保存${rangeName}计划`}</button></div>
    </form>
  )
}
