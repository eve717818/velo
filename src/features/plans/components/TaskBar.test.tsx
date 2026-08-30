import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as planTaskService from "@/features/plans/data/plan-task-service"

import { TaskBar } from "./TaskBar"

function createDatabase() {
  return new VeloDB(`velo-task-bar-${crypto.randomUUID()}`)
}

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: "task-bar",
    title: "复习导数",
    scheduledDate: "2026-08-28",
    subject: "高等数学",
    estimatedMinutes: 45,
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("TaskBar", () => {
  it("has no checkbox and completes a focused task with Enter", async () => {
    const db = createDatabase()
    const currentTask = task()
    const user = userEvent.setup()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()

      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      bar.focus()
      await user.keyboard("{Enter}")

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
      expect(screen.getByText("已完成")).toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("completes with Space and lets the user undo within five seconds", async () => {
    const db = createDatabase()
    const currentTask = task()
    const user = userEvent.setup()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      bar.focus()
      await user.keyboard(" ")

      expect(await screen.findByRole("status")).toHaveTextContent("任务已完成")
      await user.click(screen.getByRole("button", { name: "撤销" }))

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 }))
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps the Dexie task pending during a swipe preview and persists only after a 70 percent release", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70 })

      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })
      expect(bar).toHaveStyle({ "--swipe-progress": "0.7" })

      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 70 })

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("cancels a preview without changing the Dexie task", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 65 })
      fireEvent.pointerCancel(bar, { pointerId: 1 })

      expect(bar).toHaveStyle({ "--swipe-progress": "0" })
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("ignores a second pointer until the captured pointer releases", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0 })
      fireEvent.pointerDown(bar, { pointerId: 2, clientX: 90 })
      fireEvent.pointerMove(bar, { pointerId: 2, clientX: 100 })
      fireEvent.pointerUp(bar, { pointerId: 2, clientX: 100 })

      expect(bar).toHaveStyle({ "--swipe-progress": "0" })
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })

      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 70 })

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("resets a captured swipe when pointer capture is lost", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 65 })
      fireEvent.lostPointerCapture(bar, { pointerId: 1 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 100 })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

      expect(bar).toHaveStyle({ "--swipe-progress": "0" })
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("does not create an undo timer after an in-flight completion unmounts", async () => {
    const completion = deferred<void>()
    const currentTask = task()
    const put = vi.fn(() => completion.promise)
    const db = {
      planTasks: {
        get: () => Promise.resolve(currentTask),
        put,
      },
      transaction: async (_mode: unknown, _table: unknown, run: () => Promise<unknown>) => run(),
    } as unknown as VeloDB
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      fireEvent.keyDown(screen.getByRole("button", { name: "打开任务操作：复习导数" }), { key: "Enter" })
      await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
      try {
        rendered.unmount()
        await act(async () => {
          completion.resolve()
          await completion.promise
          await Promise.resolve()
          await Promise.resolve()
        })

        expect(setTimeoutSpy).not.toHaveBeenCalled()
      } finally {
        setTimeoutSpy.mockRestore()
      }
    } finally {
      rendered.unmount()
    }
  })

  it("keeps the task incomplete and retries completion after a failed write", async () => {
    const db = createDatabase()
    const currentTask = task()
    const user = userEvent.setup()
    const realCompletion = planTaskService.setTaskCompletion
    const completionSpy = vi.spyOn(planTaskService, "setTaskCompletion")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realCompletion)
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      bar.focus()
      await user.keyboard("{Enter}")

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })

      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
      expect(completionSpy).toHaveBeenCalledTimes(2)
    } finally {
      completionSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps the task in its lane and retries the same move target after a failed write", async () => {
    const db = createDatabase()
    const currentTask = task({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 4 })
    const user = userEvent.setup()
    const realMove = planTaskService.movePlanTask
    const moveSpy = vi.spyOn(planTaskService, "movePlanTask")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realMove)
    await db.planTasks.add(currentTask)
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-29"
    dropZone.dataset.startMinutes = "840"
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => dropZone })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      vi.useRealTimers()

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 4 })

      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-29", startMinutes: 840 }))
      expect(moveSpy).toHaveBeenCalledTimes(2)
    } finally {
      moveSpy.mockRestore()
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("gives the undo button a 44 pixel minimum hit target", async () => {
    const db = createDatabase()
    const currentTask = task()
    const user = userEvent.setup()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      bar.focus()
      await user.keyboard("{Enter}")

      const undo = await screen.findByRole("button", { name: "撤销" })
      expect(getComputedStyle(undo).minHeight).toBe("44px")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("starts dragging only after a 350 millisecond long press", async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const rendered = render(<TaskBar db={db} task={task()} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(349))
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      expect(screen.queryByTestId("task-drag-layer")).not.toBeInTheDocument()

      fireEvent.pointerDown(bar, { pointerId: 2, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      expect(screen.getByTestId("task-drag-layer")).toBeInTheDocument()
    } finally {
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("keeps a direct horizontal gesture available for swipe completion instead of dragging", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70, clientY: 0 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 70, clientY: 0 })

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
      expect(screen.queryByTestId("task-drag-layer")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("does not complete after vertical scrolling begins even when the horizontal threshold was reached", async () => {
    const db = createDatabase()
    const currentTask = task()
    const setTaskCompletionSpy = vi.spyOn(planTaskService, "setTaskCompletion")
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70, clientY: 9 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 70, clientY: 9 })

      expect(bar).toHaveStyle({ "--swipe-progress": "0" })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      expect(setTaskCompletionSpy).not.toHaveBeenCalled()
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })
    } finally {
      setTaskCompletionSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("does not complete when a vertical scroll accompanies the final threshold movement", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 69, clientY: 0 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 70, clientY: 9 })

      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0 })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("resets a vertical scroll cancellation so the next horizontal swipe can complete", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      Object.defineProperty(bar, "offsetWidth", { configurable: true, value: 100 })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 70, clientY: 9 })
      fireEvent.lostPointerCapture(bar, { pointerId: 1 })

      fireEvent.pointerDown(bar, { pointerId: 2, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(bar, { pointerId: 2, clientX: 70, clientY: 0 })
      fireEvent.pointerUp(bar, { pointerId: 2, clientX: 70, clientY: 0 })

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("cancels a long press after vertical movement without changing the task", async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const rendered = render(<TaskBar db={db} task={task()} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 10, clientY: 19 })
      void act(() => vi.advanceTimersByTime(350))

      expect(screen.queryByTestId("task-drag-layer")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("does not drop after an active drag turns into vertical scrolling", async () => {
    const db = createDatabase()
    const currentTask = task()
    const movePlanTaskSpy = vi.spyOn(planTaskService, "movePlanTask")
    await db.planTasks.add(currentTask)
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-29"
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => dropZone })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 20, clientY: 39 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 39 })
      vi.useRealTimers()

      const savedTask = await db.planTasks.get(currentTask.id)
      expect(movePlanTaskSpy).not.toHaveBeenCalled()
      expect(screen.queryByTestId("task-drag-layer")).not.toBeInTheDocument()
      expect(savedTask).toMatchObject({ scheduledDate: "2026-08-28", order: 1 })
      expect(savedTask?.startMinutes).toBeUndefined()
    } finally {
      movePlanTaskSpy.mockRestore()
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("moves to a nested timed drop target and restores the original lane on undo", async () => {
    const db = createDatabase()
    const currentTask = task({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 4 })
    await db.planTasks.add(currentTask)
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-29"
    dropZone.dataset.startMinutes = "840"
    const nestedTarget = document.createElement("span")
    dropZone.append(nestedTarget)
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => nestedTarget })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerMove(bar, { pointerId: 1, clientX: 40, clientY: 30 })
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 40, clientY: 30 })
      vi.useRealTimers()

      await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-29", startMinutes: 840, order: 1 })
      expect(await screen.findByRole("status")).toHaveTextContent("已移动到目标位置")
      await userEvent.setup().click(screen.getByRole("button", { name: "撤销" }))
      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 4 }))
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("moves an untimed task to an untimed lane on a different date", async () => {
    const db = createDatabase()
    const currentTask = task({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 4 })
    await db.planTasks.bulkAdd([
      currentTask,
      task({ id: "target-date-task", title: "整理错题", scheduledDate: "2026-08-29", startMinutes: undefined, order: 3 }),
    ])
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-29"
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => dropZone })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      vi.useRealTimers()

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-29", startMinutes: undefined, order: 4 }))
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("reorders an untimed task when it is dropped back into its current lane", async () => {
    const db = createDatabase()
    const currentTask = task({ order: 2 })
    await db.planTasks.bulkAdd([currentTask, task({ id: "later-task", title: "预习积分", order: 5 })])
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-28"
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => dropZone })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      vi.useRealTimers()

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-28", startMinutes: undefined, order: 6 }))
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("reorders a timed task when it is dropped back into its current timed lane", async () => {
    const db = createDatabase()
    const currentTask = task({ startMinutes: 540, order: 2 })
    await db.planTasks.bulkAdd([currentTask, task({ id: "later-task", title: "预习积分", startMinutes: 600, order: 5 })])
    vi.useFakeTimers()
    const dropZone = document.createElement("div")
    dropZone.dataset.dropDate = "2026-08-28"
    dropZone.dataset.startMinutes = "720"
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => dropZone })
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerUp(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      vi.useRealTimers()

      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-28", startMinutes: 720, order: 6 }))
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("cancels an active drag without moving the task", async () => {
    const db = createDatabase()
    const currentTask = task()
    await db.planTasks.add(currentTask)
    vi.useFakeTimers()
    const rendered = render(<TaskBar db={db} task={currentTask} />)

    try {
      const bar = screen.getByRole("button", { name: "打开任务操作：复习导数" })
      fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20, clientY: 30 })
      void act(() => vi.advanceTimersByTime(350))
      fireEvent.pointerCancel(bar, { pointerId: 1 })

      expect(screen.queryByTestId("task-drag-layer")).not.toBeInTheDocument()
      vi.useRealTimers()
      expect(await db.planTasks.get(currentTask.id)).toMatchObject({ scheduledDate: "2026-08-28", order: 1 })
    } finally {
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })
})
