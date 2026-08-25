export type PlanScope = "day" | "week" | "month" | "semester"

export interface PlanTask {
  id: string
  scope: PlanScope
  periodKey: string
  title: string
  subject?: string
  estimatedMinutes?: number
  linkedNodeId?: string
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
