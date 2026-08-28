import { formatLocalDate } from "../lib/local-date"
import type { KnowledgeNode, NoteDocument, PlanTask } from "./types"
import { type VeloDB } from "./velo-db"

const HOME_DEMO_SEED_KEY = "homeDemoSeed"
const HOME_DEMO_SEED_VERSION = "v1"

export async function seedHomeDemo(db: VeloDB, now: Date): Promise<void> {
  const scheduledDate = formatLocalDate(now)
  const timestamp = now.getTime()

  await db.transaction("rw", db.planTasks, db.knowledgeNodes, db.notes, db.appMeta, async () => {
    const existingMarker = await db.appMeta.get(HOME_DEMO_SEED_KEY)
    if (existingMarker) {
      return
    }

    const [taskCount, nodeCount, noteCount] = await Promise.all([
      db.planTasks.count(),
      db.knowledgeNodes.count(),
      db.notes.count(),
    ])

    if (taskCount > 0 || nodeCount > 0 || noteCount > 0) {
      await db.appMeta.put({
        key: HOME_DEMO_SEED_KEY,
        value: `${HOME_DEMO_SEED_VERSION}:skipped-existing-data`,
        updatedAt: timestamp,
      })
      return
    }

    const nodeId = crypto.randomUUID()
    const noteId = crypto.randomUUID()
    const tasks: PlanTask[] = [
      {
        id: crypto.randomUUID(),
        scheduledDate,
        title: "英语阅读 · Chapter 3",
        isCompleted: 1,
        order: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        scheduledDate,
        title: "线性代数 · 习题整理",
        isCompleted: 1,
        order: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        scheduledDate,
        title: "程序设计 · 函数与递归",
        isCompleted: 1,
        order: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        scheduledDate,
        title: "高等数学 · 导数复习",
        isCompleted: 0,
        order: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        scheduledDate,
        title: "物理实验报告 · 数据整理",
        isCompleted: 0,
        order: 5,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    const node: KnowledgeNode = {
      id: nodeId,
      parentId: null,
      type: "note",
      title: "线性代数：矩阵的秩",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const note: NoteDocument = {
      id: noteId,
      nodeId,
      title: "线性代数：矩阵的秩",
      content: { type: "doc", content: [] },
      plainText: "矩阵的秩",
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await db.planTasks.bulkAdd(tasks)
    await db.knowledgeNodes.add(node)
    await db.notes.add(note)
    await db.appMeta.put({
      key: HOME_DEMO_SEED_KEY,
      value: `${HOME_DEMO_SEED_VERSION}:applied`,
      updatedAt: timestamp,
    })
  })
}
