import type { PlanTask } from "@/db/types"

export interface SchedulePreviewStep {
  scheduledDate: string
  title: string
  stepIndex: number
  stepTitleMode: "inherit" | "custom"
  isCompleted?: boolean
}

interface SchedulePreviewProps {
  allTasks: PlanTask[]
  dateErrors?: Record<number, string>
  onChange: (stepIndex: number, changes: Partial<SchedulePreviewStep>) => void
  steps: SchedulePreviewStep[]
  titleErrors?: Record<number, string>
}

/** Legacy rollback surface; cross-day schedule previews are no longer available. */
export function SchedulePreview({ allTasks: _allTasks, dateErrors: _dateErrors, onChange: _onChange, steps: _steps, titleErrors: _titleErrors }: SchedulePreviewProps) {
  void [_allTasks, _dateErrors, _onChange, _steps, _titleErrors]
  return <p>跨日任务已停用</p>
}
