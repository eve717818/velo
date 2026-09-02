import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import type { LearningPeriod, PlanTask, PlanTaskScope } from "@/db/types"
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
    scope: "day",
    periodKey: "2026-08-28",
    subject: "数学",
    estimatedMinutes: 45,
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const learningPeriods: LearningPeriod[] = [
  { id: "fall", kind: "semester", name: "秋季学期", startDate: "2026-09-01", endDate: "2027-01-15", createdAt: 1, updatedAt: 1 },
  { id: "winter", kind: "winter-break", name: "寒假", startDate: "2027-01-16", endDate: "2027-02-20", createdAt: 1, updatedAt: 1 },
]

interface EditorHarnessProps {
  db: VeloDB
  periodKey?: string
  periods?: LearningPeriod[]
  scope?: PlanTaskScope
  selectedDate?: string
  task?: PlanTask
}

function EditorHarness({
  db,
  periodKey = "2026-08-28",
  periods = [],
  scope = "day",
  selectedDate = "2026-08-28",
  task,
}: EditorHarnessProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        {task ? `编辑 ${task.title}` : "新建任务"}
      </button>
      <TaskEditorDialog
        db={db}
        onClose={() => setOpen(false)}
        open={open}
        periodKey={periodKey}
        periods={periods}
        scope={scope}
        selectedDate={selectedDate}
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
  it("creates a day task with its selected date and optional start time", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
      expect(screen.getByLabelText("日期")).toHaveValue("2026-08-28")
      expect(screen.getByLabelText("开始时间")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
      await user.type(screen.getByLabelText("任务标题"), "复习导数")
      await user.clear(screen.getByLabelText("日期"))
      await user.type(screen.getByLabelText("日期"), "2026-08-29")
      await user.type(screen.getByLabelText("开始时间"), "09:30")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => {
        expect(await db.planTasks.toArray()).toMatchObject([
          { title: "复习导数", scope: "day", periodKey: "2026-08-29", startMinutes: 570 },
        ])
      })
      expect(createSpy).toHaveBeenCalledWith(db, expect.objectContaining({ scope: "day", periodKey: "2026-08-29", startMinutes: 570 }), expect.any(Number))
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("creates a week task from the selected ISO week using its Monday key", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
    const rendered = render(<EditorHarness db={db} periodKey="2026-08-31" scope="week" selectedDate="2026-09-02" />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
      expect(screen.getByLabelText("所属周")).toHaveValue("2026-W36")
      expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
      await user.type(screen.getByLabelText("任务标题"), "本周复盘")
      await user.clear(screen.getByLabelText("所属周"))
      await user.type(screen.getByLabelText("所属周"), "2026-W37")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.toArray()).toMatchObject([{ scope: "week", periodKey: "2026-09-07", startMinutes: undefined }]))
      expect(createSpy).toHaveBeenCalledWith(db, expect.objectContaining({ scope: "week", periodKey: "2026-09-07", startMinutes: undefined }), expect.any(Number))
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("creates a month task from its selected month", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
    const rendered = render(<EditorHarness db={db} periodKey="2026-09" scope="month" selectedDate="2026-09-02" />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      expect(screen.getByLabelText("所属月")).toHaveValue("2026-09")
      expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument()
      await user.type(screen.getByLabelText("任务标题"), "月度总结")
      await user.clear(screen.getByLabelText("所属月"))
      await user.type(screen.getByLabelText("所属月"), "2026-10")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.toArray()).toMatchObject([{ scope: "month", periodKey: "2026-10", startMinutes: undefined }]))
      expect(createSpy).toHaveBeenCalledWith(db, expect.objectContaining({ scope: "month", periodKey: "2026-10", startMinutes: undefined }), expect.any(Number))
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("creates a semester task from a real learning period", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
    await db.learningPeriods.bulkAdd(learningPeriods)
    const rendered = render(<EditorHarness db={db} periodKey="fall" periods={learningPeriods} scope="semester" selectedDate="2026-09-02" />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      expect(screen.getByLabelText("所属学期或假期")).toHaveValue("fall")
      expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument()
      await user.type(screen.getByLabelText("任务标题"), "学期论文")
      await user.selectOptions(screen.getByLabelText("所属学期或假期"), "winter")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.toArray()).toMatchObject([{ scope: "semester", periodKey: "winter", startMinutes: undefined }]))
      expect(createSpy).toHaveBeenCalledWith(db, expect.objectContaining({ scope: "semester", periodKey: "winter", startMinutes: undefined }), expect.any(Number))
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("rejects a semester create when the current period list is empty", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const createSpy = vi.spyOn(planTaskService, "createPlanTask")
    await db.learningPeriods.add(learningPeriods[0])
    const rendered = render(<EditorHarness db={db} periodKey="fall" periods={[]} scope="semester" selectedDate="2026-09-02" />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "不可见学期任务")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByText("请选择有效的学期或假期")).toBeInTheDocument()
      expect(screen.getByLabelText("所属学期或假期")).toHaveAttribute("aria-invalid", "true")
      expect(createSpy).not.toHaveBeenCalled()
      expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("rejects an edited semester task whose stored key is no longer in the current period list", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const task = existingTask({ scope: "semester", periodKey: "winter", startMinutes: undefined })
    const updateSpy = vi.spyOn(planTaskService, "updatePlanTask")
    await db.learningPeriods.bulkAdd(learningPeriods)
    await db.planTasks.add(task)
    const rendered = render(<EditorHarness db={db} periodKey="fall" periods={[learningPeriods[0]]} scope="day" task={task} />)

    try {
      await user.click(screen.getByRole("button", { name: "编辑 整理错题" }))
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByText("请选择有效的学期或假期")).toBeInTheDocument()
      expect(screen.getByLabelText("所属学期或假期")).toHaveAttribute("aria-invalid", "true")
      expect(updateSpy).not.toHaveBeenCalled()
      expect(screen.getByRole("dialog", { name: "编辑学习任务" })).toBeInTheDocument()
      expect(await db.planTasks.get(task.id)).toMatchObject({ scope: "semester", periodKey: "winter" })
    } finally {
      updateSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("locks an edited task to its stored scope even if its caller is on another scope", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const task = existingTask({ scope: "week", periodKey: "2026-08-31", startMinutes: undefined })
    await db.planTasks.add(task)
    const rendered = render(<EditorHarness db={db} periodKey="2026-08-28" scope="day" task={task} />)

    try {
      await user.click(screen.getByRole("button", { name: "编辑 整理错题" }))
      expect(screen.getByLabelText("所属周")).toHaveValue("2026-W36")
      expect(screen.queryByLabelText("日期")).not.toBeInTheDocument()
      await user.clear(screen.getByLabelText("任务标题"))
      await user.type(screen.getByLabelText("任务标题"), "本周错题复盘")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.get(task.id)).toMatchObject({ title: "本周错题复盘", scope: "week", periodKey: "2026-08-31" }))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("validates required day fields and fractional estimates before saving", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = render(<EditorHarness db={db} />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.clear(screen.getByLabelText("任务标题"))
      await user.clear(screen.getByLabelText("日期"))
      await user.type(screen.getByLabelText("预计时长（分钟）"), "12.5")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(screen.getByText("请填写任务标题")).toBeInTheDocument()
      expect(screen.getByText("请选择周期")).toBeInTheDocument()
      expect(screen.getByText("预计时长必须是正整数")).toBeInTheDocument()
      expect(screen.getByLabelText("任务标题")).toHaveAttribute("aria-invalid", "true")
      expect(screen.getByLabelText("日期")).toHaveAttribute("aria-invalid", "true")
      expect(screen.getByLabelText("预计时长（分钟）")).toHaveAttribute("aria-invalid", "true")
      expect(await db.planTasks.toArray()).toHaveLength(0)
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps every entered value after a failed save", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    db.planTasks.hook("creating", () => { throw new Error("磁盘写入失败") })
    const rendered = render(<EditorHarness db={db} periodKey="2026-08-31" scope="week" />)

    try {
      await user.click(screen.getByRole("button", { name: "新建任务" }))
      await user.type(screen.getByLabelText("任务标题"), "保留这条任务")
      await user.clear(screen.getByLabelText("所属周"))
      await user.type(screen.getByLabelText("所属周"), "2026-W37")
      await user.type(screen.getByLabelText("科目"), "数学")
      await user.type(screen.getByLabelText("预计时长（分钟）"), "45")
      await user.type(screen.getByLabelText("备注"), "先看错题")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("磁盘写入失败")
      expect(screen.getByLabelText("任务标题")).toHaveValue("保留这条任务")
      expect(screen.getByLabelText("所属周")).toHaveValue("2026-W37")
      expect(screen.getByLabelText("科目")).toHaveValue("数学")
      expect(screen.getByLabelText("预计时长（分钟）")).toHaveValue(45)
      expect(screen.getByLabelText("备注")).toHaveValue("先看错题")
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
        onToggleCompletion={vi.fn()}
        open
        task={task}
      />,
    )

    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始专注" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "移动到日期/时间" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument()
  })

  it("offers completion and restore actions based on task state", () => {
    const onToggleCompletion = vi.fn()
    const { rerender } = render(
      <TaskActionsDialog
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onStartFocus={vi.fn()}
        onToggleCompletion={onToggleCompletion}
        open
        task={existingTask()}
      />,
    )

    expect(screen.getByRole("button", { name: "标记为完成" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "恢复为未完成" })).not.toBeInTheDocument()
    rerender(
      <TaskActionsDialog
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onStartFocus={vi.fn()}
        onToggleCompletion={onToggleCompletion}
        open
        task={existingTask({ isCompleted: 1, completedAt: 2 })}
      />,
    )
    expect(screen.getByRole("button", { name: "恢复为未完成" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "标记为完成" })).not.toBeInTheDocument()
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
