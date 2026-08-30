import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as planTaskService from "../data/plan-task-service"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { TaskActionsDialog } from "./TaskActionsDialog"
import { TaskEditorDialog } from "./TaskEditorDialog"
import { PlansPage } from "@/pages/PlansPage"

function createDatabase() {
  return new VeloDB(`velo-task-editor-${crypto.randomUUID()}`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, reject, resolve }
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

  it("keeps the dialog open and retries the last entered values after a failed save", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    let failWrite = true
    db.planTasks.hook("creating", () => {
      if (failWrite) throw new Error("磁盘写入失败")
    })
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "重试后保存")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      expect(screen.getByLabelText("任务标题")).toHaveValue("重试后保存")

      failWrite = false
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.toArray()).toMatchObject([{ title: "重试后保存" }]))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("ignores a completed save from a closed editor session", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const firstSave = deferred<PlanTask>()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce((_db, input, now) => Promise.resolve({ id: "second", isCompleted: 0, order: 1, createdAt: now, updatedAt: now, ...input }))
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "旧会话")
      await user.click(screen.getByRole("button", { name: "保存任务" }))
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "新会话")

      await act(async () => {
        firstSave.resolve(existingTask({ id: "first", title: "旧会话" }))
        await firstSave.promise
      })

      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
      expect(screen.getByLabelText("任务标题")).toHaveValue("新会话")
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("retries the last submitted edit values after an update failure", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    const realUpdate = planTaskService.updatePlanTask
    const updateSpy = vi.spyOn(planTaskService, "updatePlanTask")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realUpdate)
    await db.planTasks.add(task)
    const rendered = render(<EditorHarness db={db} task={task} />)

    try {
      await user.click(screen.getByRole("button", { name: "编辑 整理错题" }))
      await user.clear(screen.getByLabelText("任务标题"))
      await user.type(screen.getByLabelText("任务标题"), "整理微积分错题")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.clear(screen.getByLabelText("任务标题"))
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.get(task.id)).toMatchObject({ title: "整理微积分错题" }))
      expect(updateSpy).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    } finally {
      updateSpy.mockRestore()
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

  it("ignores a completed save from a backdrop-closed editor session", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const firstSave = deferred<PlanTask>()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce((_db, input, now) => Promise.resolve({ id: "second", isCompleted: 0, order: 1, createdAt: now, updatedAt: now, ...input }))
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "旧会话")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      const dialog = screen.getByRole("dialog", { name: "新建学习任务" })
      const rectSpy = vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
        x: 120,
        y: 180,
        top: 180,
        right: 360,
        bottom: 420,
        left: 120,
        width: 240,
        height: 240,
        toJSON: () => ({}),
      })
      fireEvent.click(dialog, { clientX: 90, clientY: 240 })
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "新会话")

      await act(async () => {
        firstSave.resolve(existingTask({ id: "first", title: "旧会话" }))
        await firstSave.promise
      })

      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
      expect(screen.getByLabelText("任务标题")).toHaveValue("新会话")
      rectSpy.mockRestore()
    } finally {
      createSpy.mockRestore()
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

  it("clears delete errors across close and retries the same task deletion", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    const realDelete = planTaskService.deletePlanTask
    const deleteSpy = vi.spyOn(planTaskService, "deletePlanTask")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realDelete)
    await db.planTasks.add(task)
    const rendered = render(<DeleteHarness db={db} task={task} />)

    try {
      const trigger = screen.getByRole("button", { name: "删除 整理错题" })
      await user.click(trigger)
      await user.click(screen.getByRole("button", { name: "确认删除" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.get(task.id)).toBeUndefined())
      expect(deleteSpy).toHaveBeenNthCalledWith(1, db, task.id)
      expect(deleteSpy).toHaveBeenNthCalledWith(2, db, task.id)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    } finally {
      deleteSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("clears stale delete retry state when a new task session opens", async () => {
    const db = createDatabase()
    const firstTask = existingTask({ id: "first-task", title: "第一项" })
    const secondTask = existingTask({ id: "second-task", title: "第二项", updatedAt: 2 })
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(planTaskService, "deletePlanTask")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockResolvedValue(true)
    await db.planTasks.bulkAdd([firstTask, secondTask])
    const rendered = render(<DeleteTaskDialog db={db} onClose={vi.fn()} open task={firstTask} />)

    try {
      await user.click(screen.getByRole("button", { name: "确认删除" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")

      rendered.rerender(<DeleteTaskDialog db={db} onClose={vi.fn()} open task={secondTask} />)
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "确认删除" }))

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(2))
      expect(deleteSpy).toHaveBeenNthCalledWith(1, db, firstTask.id)
      expect(deleteSpy).toHaveBeenNthCalledWith(2, db, secondTask.id)
    } finally {
      deleteSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("ignores a completed delete from an Escape-closed delete session", async () => {
    const db = createDatabase()
    const firstTask = existingTask({ id: "first-task", title: "第一项" })
    const secondTask = existingTask({ id: "second-task", title: "第二项", updatedAt: 2 })
    const user = userEvent.setup()
    const firstDelete = deferred<boolean>()
    const deleteSpy = vi.spyOn(planTaskService, "deletePlanTask")
      .mockImplementationOnce(() => firstDelete.promise)
      .mockResolvedValue(true)
    await db.planTasks.bulkAdd([firstTask, secondTask])
    const rendered = render(<DeleteHarness db={db} task={firstTask} />)

    try {
      await user.click(screen.getByRole("button", { name: "删除 第一项" }))
      await user.click(screen.getByRole("button", { name: "确认删除" }))
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

      rendered.rerender(<DeleteHarness db={db} task={secondTask} />)
      await user.click(screen.getByRole("button", { name: "删除 第二项" }))

      await act(async () => {
        firstDelete.resolve(true)
        await firstDelete.promise
      })

      expect(screen.getByRole("dialog", { name: "确定删除“第二项”吗？" })).toBeInTheDocument()
      expect(deleteSpy).toHaveBeenCalledTimes(1)
    } finally {
      deleteSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("clears delete errors across close and reopen", async () => {
    const db = createDatabase()
    const task = existingTask()
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(planTaskService, "deletePlanTask")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockResolvedValue(true)
    await db.planTasks.add(task)
    const rendered = render(<DeleteHarness db={db} task={task} />)

    try {
      const trigger = screen.getByRole("button", { name: "删除 整理错题" })
      await user.click(trigger)
      await user.click(screen.getByRole("button", { name: "确认删除" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "取消" }))
      await user.click(trigger)
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    } finally {
      deleteSpy.mockRestore()
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
