import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { DayPlanView } from "./DayPlanView"

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "复习导数",
    scheduledDate: "2026-08-28",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("DayPlanView", () => {
  it("sorts timed tasks, keeps untimed tasks in 待安排, and marks only past incomplete work overdue", () => {
    const db = new VeloDB(`day-view-${crypto.randomUUID()}`)
    const rendered = render(
      <DayPlanView
        db={db}
        selectedDate="2026-08-28"
        tasks={[
          task({ id: "late", title: "晚课", startMinutes: 840 }),
          task({ id: "early", title: "早课", startMinutes: 540 }),
          task({ id: "unscheduled", title: "整理错题" }),
          task({ id: "overdue", title: "昨天未完成", scheduledDate: "2026-08-27" }),
          task({ id: "finished", title: "昨天完成", scheduledDate: "2026-08-27", isCompleted: 1 }),
        ]}
        today="2026-08-28"
      />,
    )

    try {
      const timed = screen.getByLabelText("定时任务")
      expect(within(timed).getAllByRole("button").map((button) => button.textContent)).toEqual([
        expect.stringContaining("早课"),
        expect.stringContaining("晚课"),
      ])
      expect(within(timed).getByText("09:00", { selector: "time" })).toBeInTheDocument()
      expect(within(timed).getByText("14:00", { selector: "time" })).toBeInTheDocument()
      expect(within(screen.getByLabelText("待安排任务")).getByText("整理错题")).toBeInTheDocument()
      expect(screen.getByText("已逾期")).toBeInTheDocument()
      expect(screen.getAllByText("已逾期")).toHaveLength(1)
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("offers one new-task action for an empty day", () => {
    const db = new VeloDB(`day-view-${crypto.randomUUID()}`)
    const onCreate = vi.fn()
    const rendered = render(<DayPlanView db={db} onCreate={onCreate} selectedDate="2026-08-28" tasks={[]} />)

    try {
      expect(screen.getAllByRole("button", { name: "新建任务" })).toHaveLength(1)
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })
})
