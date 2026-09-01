import type { PlanTask, PlanTaskGroup } from "@/db/types"

interface TaskGroupBandProps {
  group: PlanTaskGroup
  onOpen?: (group: PlanTaskGroup, trigger: HTMLButtonElement) => void
  rangeEnd: string
  rangeStart: string
  showProgress?: boolean
  tasks: PlanTask[]
  today: string
  variant: "week" | "month"
}

/** Legacy rollback surface; active plans do not render cross-day task bands. */
export function TaskGroupBand(_props: TaskGroupBandProps) {
  void _props
  return null
}
