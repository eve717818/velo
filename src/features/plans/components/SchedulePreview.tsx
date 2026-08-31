import type { PlanTask, PlanTaskStepTitleMode } from "@/db/types"

import styles from "./PlanDialog.module.css"

export interface SchedulePreviewStep {
  scheduledDate: string
  title: string
  stepIndex: number
  stepTitleMode: PlanTaskStepTitleMode
  isCompleted?: boolean
}

interface SchedulePreviewProps {
  allTasks: PlanTask[]
  dateErrors?: Record<number, string>
  onChange: (stepIndex: number, changes: Partial<SchedulePreviewStep>) => void
  steps: SchedulePreviewStep[]
  titleErrors?: Record<number, string>
}

export function SchedulePreview({ allTasks, dateErrors = {}, onChange, steps, titleErrors = {} }: SchedulePreviewProps) {
  return (
    <section aria-labelledby="schedule-preview-heading" className={styles.schedulePreview}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.previewEyebrow}>系统建议</p>
          <h3 id="schedule-preview-heading">排期预览</h3>
        </div>
        <span>{steps.length} 次学习</span>
      </div>

      <ol className={styles.previewList}>
        {steps.map((step) => {
          const dateErrorId = `schedule-step-${step.stepIndex}-date-error`
          const titleErrorId = `schedule-step-${step.stepIndex}-title-error`
          const dateTasks = allTasks.filter((task) => task.scheduledDate === step.scheduledDate)
          const minutes = dateTasks.reduce((total, task) => total + (task.estimatedMinutes ?? 30), 0)
          return (
            <li className={styles.previewRow} key={step.stepIndex}>
              <div className={styles.stepMeta}>
                <strong>第 {step.stepIndex} 次</strong>
                {step.isCompleted ? <span className={styles.completedLabel}>已完成 · 保留记录</span> : null}
              </div>
              <div className={styles.previewFields}>
                <label className={styles.field} htmlFor={`schedule-step-${step.stepIndex}-date`}>
                  <span>日期</span>
                  <input
                    aria-label={`第 ${step.stepIndex} 次日期`}
                    aria-describedby={dateErrors[step.stepIndex] ? dateErrorId : undefined}
                    aria-invalid={Boolean(dateErrors[step.stepIndex])}
                    disabled={step.isCompleted}
                    id={`schedule-step-${step.stepIndex}-date`}
                    onChange={(event) => onChange(step.stepIndex, { scheduledDate: event.target.value })}
                    type="date"
                    value={step.scheduledDate}
                  />
                  {dateErrors[step.stepIndex] ? <small id={dateErrorId} role="alert">{dateErrors[step.stepIndex]}</small> : null}
                </label>
                <label className={styles.field} htmlFor={`schedule-step-${step.stepIndex}-title`}>
                  <span>本次内容</span>
                  <input
                    aria-label={`第 ${step.stepIndex} 次标题`}
                    aria-describedby={titleErrors[step.stepIndex] ? titleErrorId : undefined}
                    aria-invalid={Boolean(titleErrors[step.stepIndex])}
                    disabled={step.isCompleted}
                    id={`schedule-step-${step.stepIndex}-title`}
                    onChange={(event) => onChange(step.stepIndex, { title: event.target.value, stepTitleMode: "custom" })}
                    value={step.title}
                  />
                  {titleErrors[step.stepIndex] ? <small id={titleErrorId} role="alert">{titleErrors[step.stepIndex]}</small> : null}
                </label>
              </div>
              <p className={styles.loadSummary}>当天已有 {dateTasks.length} 项 · 预计 {minutes} 分钟</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
