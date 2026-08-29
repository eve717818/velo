import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

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
})
