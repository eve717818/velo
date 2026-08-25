import Dexie, { type Table } from "dexie"
import type { AppMeta, KnowledgeNode, NoteDocument, PlanTask } from "./types"

export class VeloDB extends Dexie {
  planTasks!: Table<PlanTask, string>
  knowledgeNodes!: Table<KnowledgeNode, string>
  notes!: Table<NoteDocument, string>
  appMeta!: Table<AppMeta, string>

  constructor(name: string) {
    super(name)

    this.version(1).stores({
      planTasks: "id, [scope+periodKey], periodKey, isCompleted, order, updatedAt",
      knowledgeNodes: "id, parentId, type, order, updatedAt",
      notes: "id, nodeId, title, updatedAt",
      appMeta: "key, updatedAt",
    })
  }
}

export const veloDb = new VeloDB("velo")
