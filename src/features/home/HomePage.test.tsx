import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import type { NoteDocument, PlanTask } from "@/db/types"
import { seedHomeDemo } from "@/db/seed"
import { VeloDB } from "@/db/velo-db"
import { HomePage } from "./HomePage"

const now = new Date(2026, 7, 25, 9, 0)

function createDatabase() {
  return new VeloDB(`velo-home-page-${crypto.randomUUID()}`)
}

function renderHome(db: VeloDB) {
  return render(
    <MemoryRouter>
      <HomePage db={db} now={now} />
    </MemoryRouter>,
  )
}

describe("HomePage", () => {
  it("shows today only from the day workspace", async () => {
    const db = createDatabase()
    const today = "2026-08-25"
    const task = (overrides: Pick<PlanTask, "id" | "title" | "scope" | "periodKey"> & Partial<PlanTask>): PlanTask => ({
      isCompleted: 0,
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    })
    await db.planTasks.bulkAdd([
      task({ id: "day-done", title: "今日已完成", scope: "day", periodKey: today, isCompleted: 1, order: 1 }),
      task({ id: "day-next", title: "今日下一项", scope: "day", periodKey: today, order: 2 }),
      task({ id: "week", title: "本周任务", scope: "week", periodKey: "2026-08-24", order: 1 }),
      task({ id: "month", title: "本月任务", scope: "month", periodKey: "2026-08", order: 1 }),
      task({ id: "semester", title: "学期任务", scope: "semester", periodKey: "fall", order: 1 }),
    ])
    const view = renderHome(db)

    try {
      expect(await screen.findByText("1 / 2")).toBeInTheDocument()
      expect(screen.getByText("今日下一项")).toBeInTheDocument()
      expect(screen.queryByText("本周任务")).not.toBeInTheDocument()
      expect(screen.queryByText("本月任务")).not.toBeInTheDocument()
      expect(screen.queryByText("学期任务")).not.toBeInTheDocument()
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  it("renders the seeded home snapshot and actionable destinations", async () => {
    const db = createDatabase()
    await seedHomeDemo(db, now)

    const view = renderHome(db)

    try {
      expect(await screen.findByText("3 / 5")).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "今日学习工作台" })).toHaveAttribute("data-layout", "bento")
      for (const headingName of ["今日学习进度", "接下来", "最近笔记", "快捷操作"]) {
        expect(screen.getByRole("heading", { name: headingName }).closest("[data-bento-card]")).not.toBeNull()
      }
      expect(screen.getByText("高等数学 · 导数复习")).toBeInTheDocument()
      expect(screen.getByText("还没有笔记")).toBeInTheDocument()
      expect(screen.queryByText("线性代数：矩阵的秩")).not.toBeInTheDocument()
      expect(screen.getByRole("link", { name: "新建笔记" })).toHaveAttribute("href", "/notes?new=1")
      expect(screen.queryByRole("link", { name: "拍照录入" })).not.toBeInTheDocument()
      expect(screen.getByText("敬请期待")).toBeVisible()
      expect(screen.getByRole("link", { name: "开始专注" })).toHaveAttribute("href", "/focus?start=1")
      expect(screen.getByRole("link", { name: "查看下一项任务：高等数学 · 导数复习" })).toHaveAttribute("href", expect.stringMatching(/^\/focus\?task=.+&minutes=25$/))
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  it("reserves the cockpit layout while its live query is loading", async () => {
    const db = createDatabase()
    const view = renderHome(db)

    try {
      const main = screen.getByRole("main")

      expect(main).toHaveAttribute("aria-busy", "true")
      expect(screen.getByRole("heading", { name: "今日学习进度" })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "接下来" })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "最近笔记" })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "快捷操作" })).toBeInTheDocument()
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  it("offers plan creation when today's task list is empty", async () => {
    const db = createDatabase()
    const view = renderHome(db)

    try {
      expect(await screen.findByText("今天还没有计划")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "创建今日计划" })).toHaveAttribute("href", "/plans?new=1")
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  it("reacts when today's next task is completed after mount", async () => {
    const db = createDatabase()
    await seedHomeDemo(db, now)
    const view = renderHome(db)

    try {
      expect(await screen.findByText("3 / 5")).toBeInTheDocument()
      const nextTask = await db.planTasks.filter((task) => task.title === "高等数学 · 导数复习").first()
      if (!nextTask) throw new Error("Expected seeded next task")

      await db.planTasks.update(nextTask.id, { isCompleted: 1 })

      expect(await screen.findByText("4 / 5")).toBeInTheDocument()
      expect(screen.getByText("物理实验报告 · 数据整理")).toBeInTheDocument()
    } finally {
      view.unmount()
      await db.delete()
    }
  })

  it("removes a trashed recent note from the live home view", async () => {
    const db = createDatabase()
    const liveNote: NoteDocument = { id: "live-note", nodeId: "live-node", title: "仍可查看", content: {}, plainText: "保留", createdAt: 1, updatedAt: 1 }
    const trashedNote: NoteDocument = { id: "trashed-note", nodeId: "trashed-node", title: "已删除笔记", content: {}, plainText: "排除", createdAt: 2, updatedAt: 2 }
    await db.knowledgeNodes.bulkAdd([
      { id: "live-node", parentId: null, type: "note", title: liveNote.title, order: 0, createdAt: 1, updatedAt: 1 },
      { id: "trashed-node", parentId: null, type: "note", title: trashedNote.title, order: 1, deletedAt: 2, trashRootId: "trashed-node", createdAt: 2, updatedAt: 2 },
    ])
    await db.notes.bulkAdd([liveNote, trashedNote])
    const view = renderHome(db)

    try {
      expect(await screen.findByText("仍可查看")).toBeInTheDocument()
      expect(screen.queryByText("已删除笔记")).not.toBeInTheDocument()
    } finally {
      view.unmount()
      await db.delete()
    }
  })
})
