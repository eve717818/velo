import { useState } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { TaskActionsDialog } from "./TaskActionsDialog"
import { TaskEditorDialog } from "./TaskEditorDialog"
import { PlansPage } from "@/pages/PlansPage"

function createDatabase() {
  return new VeloDB(`velo-task-editor-${crypto.randomUUID()}`)
}

function existingTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: "existing-task",
    title: "整理错题",
    scheduledDate: "2026-08-28",
    subject: "数学",
    estimatedMinutes: 45,
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function EditorHarness({ db, task }: { db: VeloDB; task?: PlanTask }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        {task ? `编辑 ${task.title}` : "新建任务"}
      </button>
      <TaskEditorDialog
        db={db}
        initialDate="2026-08-28"
        onClose={() => setOpen(false)}
        open={open}
        task={task}
      />
    </>
  )
}

function DeleteHarness({ db, task }: { db: VeloDB; task: PlanTask }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        删除 {task.title}
      </button>
      <DeleteTaskDialog db={db} onClose={() => setOpen(false)} open={open} task={task} />
    </>
  )
}

describe("TaskEditorDialog", () => {
  it("names the new-task dialog, validates adjacent required fields, and creates a task", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))

      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()

      await user.clear(screen.getByLabelText("任务标题"))
      await user.clear(screen.getByLabelText("日期"))
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(screen.getByText("请填写任务标题")).toBeInTheDocument()
      expect(screen.getByText("请选择日期")).toBeInTheDocument()
      expect(screen.getByLabelText("任务标题")).toHaveAttribute("aria-invalid", "true")
      expect(screen.getByLabelText("日期")).toHaveAttribute("aria-invalid", "true")

      await user.type(screen.getByLabelText("任务标题"), "复习导数")
      await user.type(screen.getByLabelText("日期"), "2026-08-29")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => {
        expect(await db.planTasks.toArray()).toMatchObject([
          { title: "复习导数", scheduledDate: "2026-08-29", isCompleted: 0 },
        ])
      })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps entered values when saving is rejected", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    db.planTasks.hook("creating", () => {
      throw new Error("磁盘写入失败")
    })
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "保留这条任务")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("磁盘写入失败")
      expect(screen.getByLabelText("任务标题")).toHaveValue("保留这条任务")
      expect(screen.getByLabelText("日期")).toHaveValue("2026-08-28")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("edits an existing task without generating a new ID", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    await db.planTasks.add(task)
    const rendered = render(<EditorHarness db={db} task={task} />)

    try {
      await user.click(screen.getByRole("button", { name: "编辑 整理错题" }))
      await user.clear(screen.getByLabelText("任务标题"))
      await user.type(screen.getByLabelText("任务标题"), "整理微积分错题")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => {
        expect(await db.planTasks.toArray()).toMatchObject([
          { id: "existing-task", title: "整理微积分错题" },
        ])
      })
      expect(await db.planTasks.count()).toBe(1)
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("closes with Escape and restores focus to its trigger", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = render(<EditorHarness db={db} />)

    try {
      const trigger = screen.getByRole("button", { name: "新建任务" })
      await user.click(trigger)
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(trigger).toHaveFocus()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})

describe("task actions and deletion", () => {
  it("exposes the scoped action entries", () => {
    const task = existingTask()
    render(
      <TaskActionsDialog
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onStartFocus={vi.fn()}
        open
        task={task}
      />,
    )

    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始专注" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "移动到日期/时间" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument()
  })

  it("cancels or confirms deletion in a separate dialog that names the task", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    await db.planTasks.add(task)
    const rendered = render(<DeleteHarness db={db} task={task} />)

    try {
      const trigger = screen.getByRole("button", { name: "删除 整理错题" })
      await user.click(trigger)
      expect(screen.getByRole("dialog")).toHaveTextContent("确定删除“整理错题”吗？")
      await user.click(screen.getByRole("button", { name: "取消" }))
      expect(await db.planTasks.get(task.id)).toBeDefined()
      expect(trigger).toHaveFocus()

      await user.click(trigger)
      await user.click(screen.getByRole("button", { name: "确认删除" }))
      await waitFor(async () => expect(await db.planTasks.get(task.id)).toBeUndefined())
      expect(trigger).toHaveFocus()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("returns focus to the invoking task after cancelling a nested delete confirmation", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    await db.planTasks.add(task)
    const rendered = render(
      <MemoryRouter initialEntries={["/plans?view=day&date=2026-08-28"]}>
        <PlansPage db={db} now={new Date(2026, 7, 28, 9, 0)} />
      </MemoryRouter>,
    )

    try {
      const trigger = await screen.findByRole("button", { name: "打开任务操作：整理错题" })
      await user.click(trigger)
      await user.click(screen.getByRole("button", { name: "删除" }))
      await user.click(screen.getByRole("button", { name: "取消" }))

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(trigger).toHaveFocus()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
