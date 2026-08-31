import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { MonthPlanView } from "./MonthPlanView"

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "不应塞入单元格的完整标题",
    scheduledDate: "2028-02-29",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("MonthPlanView", () => {
  it("splits a cross-week task band into two segments while announcing progress once", () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const group: PlanTaskGroup = {
      id: "reading-group",
      title: "完成论文精读",
      startDate: "2026-09-17",
      endDate: "2026-09-24",
      sessionCount: 4,
      createdAt: 1,
      updatedAt: 1,
    }
    const tasks = [
      task({ groupId: group.id, id: "step-1", scheduledDate: "2026-09-17", stepIndex: 1, isCompleted: 1 }),
      task({ groupId: group.id, id: "step-2", scheduledDate: "2026-09-19", stepIndex: 2 }),
      task({ groupId: group.id, id: "step-3", scheduledDate: "2026-09-22", stepIndex: 3 }),
      task({ groupId: group.id, id: "step-4", scheduledDate: "2026-09-24", stepIndex: 4 }),
    ]
    const rendered = render(
      <MonthPlanView allTasks={tasks} db={db} selectedDate="2026-09-20" taskGroups={[group]} tasks={tasks} today="2026-09-20" />,
    )

    try {
      expect(screen.getAllByTestId("month-task-group-segment")).toHaveLength(2)
      expect(screen.getAllByText("1/4")).toHaveLength(1)
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("uses a leap-month grid with counts rather than task titles and opens the chosen day list", async () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const rendered = render(<MonthPlanView db={db} selectedDate="2028-02-10" tasks={[task(), task({ id: "done", isCompleted: 1 })]} />)

    try {
      const leapDay = screen.getByRole("button", { name: "2028年2月29日，2 项任务，1 项完成" })
      expect(leapDay).toBeInTheDocument()
      expect(leapDay).toHaveTextContent("2/1")
      expect(screen.queryByText("不应塞入单元格的完整标题")).not.toBeInTheDocument()

      await user.click(leapDay)
      expect(screen.getByLabelText("2028年2月29日任务")).toHaveTextContent("不应塞入单元格的完整标题")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("moves the selected day panel with a changed workspace date", () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const rendered = render(<MonthPlanView db={db} selectedDate="2028-02-10" tasks={[]} />)

    try {
      rendered.rerender(<MonthPlanView db={db} selectedDate="2028-03-04" tasks={[]} />)
      expect(screen.getByRole("button", { name: "2028年3月4日，0 项任务，0 项完成" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("2028年3月4日任务")).toBeInTheDocument()
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })
})
