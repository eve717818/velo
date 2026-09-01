export type LearningPeriodKind = "semester" | "winter-break" | "summer-break" | "custom-break"
export type PlanTaskScope = "day" | "week" | "month" | "semester"
export type PlanTaskStepTitleMode = "inherit" | "custom"
export type RangePlanKind = "week" | "month"

export interface RangePlan {
  id: string
  kind: RangePlanKind
  rangeStart: string
  rangeEnd: string
  theme: string
  goal: string
  focusItems: string[]
  note?: string
  createdAt: number
  updatedAt: number
}

export interface PlanTaskGroup {
  id: string
  title: string
  subject?: string
  notes?: string
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
  createdAt: number
  updatedAt: number
}

export interface PlanTask {
  id: string
  title: string
  scope: PlanTaskScope
  periodKey: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
  isCompleted: 0 | 1
  completedAt?: number
  order: number
  createdAt: number
  updatedAt: number
}

export interface LearningPeriod {
  id: string
  kind: LearningPeriodKind
  name: string
  startDate: string
  endDate: string
  goal?: string
  createdAt: number
  updatedAt: number
}

export interface LegacyPlanTask {
  id: string
  scope: "day" | "week" | "month" | "semester"
  periodKey: string
  title: string
  subject?: string
  estimatedMinutes?: number
  isCompleted: 0 | 1
  order: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeNode {
  id: string
  parentId: string | null
  type: "folder" | "note"
  title: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface NoteDocument {
  id: string
  nodeId: string
  title: string
  content: Record<string, unknown>
  plainText: string
  createdAt: number
  updatedAt: number
}

export interface AppMeta {
  key: string
  value: string
  updatedAt: number
}
