import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
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
  it("renders the seeded home snapshot and actionable destinations", async () => {
    const db = createDatabase()
    await seedHomeDemo(db, now)

    const view = renderHome(db)

    try {
      expect(await screen.findByText("3 / 5")).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "今日学习工作台" })).toHaveAttribute("data-layout", "bento")
      expect(screen.getByText("高等数学 · 导数复习")).toBeInTheDocument()
      expect(screen.getByText("线性代数：矩阵的秩")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "新建笔记" })).toHaveAttribute("href", "/notes?new=1")
      expect(screen.getByRole("link", { name: "拍照录入" })).toHaveAttribute("href", "/notes?capture=1")
      expect(screen.getByRole("link", { name: "开始专注" })).toHaveAttribute("href", "/focus?start=1")
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
})
