import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PlanTask } from "@/db/types"

import { TaskDragLayer } from "./TaskDragLayer"

const task: PlanTask = {
  id: "drag-task",
  title: "复习导数",
  scheduledDate: "2026-08-28",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

describe("TaskDragLayer", () => {
  it("shows a lightweight pointer-following task preview", () => {
    render(<TaskDragLayer task={task} x={32} y={48} />)

    const layer = screen.getByTestId("task-drag-layer")
    expect(layer).toHaveTextContent("复习导数")
    expect(layer).toHaveStyle({ transform: "translate3d(32px, 48px, 0)" })
    expect(layer).toHaveAttribute("aria-hidden", "true")
  })
})
