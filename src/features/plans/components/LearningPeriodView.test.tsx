import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"

import { LearningPeriodView } from "./LearningPeriodView"

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: crypto.randomUUID(),
    kind: "semester",
    name: "2026 秋季学期",
    startDate: "2026-09-01",
    endDate: "2027-01-16",
    goal: "完成微积分基础",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "复习导数",
    scheduledDate: "2027-01-17",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("LearningPeriodView", () => {
  it("labels every period kind, orders by start date, and shows inclusive progress and goals", () => {
    render(
      <LearningPeriodView
        periods={[
          period({ id: "summer", kind: "summer-break", name: "暑假", startDate: "2027-07-01", endDate: "2027-08-31" }),
          period({ id: "winter", kind: "winter-break", name: "寒假", startDate: "2027-01-17", endDate: "2027-02-21", goal: "完成微积分基础" }),
          period({ id: "custom", kind: "custom-break", name: "考前冲刺", startDate: "2027-06-01", endDate: "2027-06-15" }),
          period({ id: "semester", startDate: "2026-09-01", endDate: "2027-01-16" }),
        ]}
        selectedPeriodId="winter"
        tasks={[
          task({ id: "last-day", scheduledDate: "2027-02-21", isCompleted: 1 }),
          task({ id: "winter-task", scheduledDate: "2027-01-17" }),
          task({ id: "outside", scheduledDate: "2027-03-01" }),
        ]}
        today="2027-02-21"
      />,
    )

    expect(screen.getByText("学期")).toBeInTheDocument()
    expect(screen.getAllByText("寒假").length).toBeGreaterThan(0)
    expect(screen.getAllByText("暑假").length).toBeGreaterThan(0)
    expect(screen.getByText("自定义假期")).toBeInTheDocument()
    expect(screen.getByText(/完成微积分基础/)).toBeInTheDocument()
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
    expect(screen.getByText("未归属周期")).toBeInTheDocument()
    expect(screen.getAllByText("复习导数").length).toBeGreaterThan(0)
    expect(screen.getAllByTestId("learning-period-card").map((card) => card.getAttribute("data-period-id"))).toEqual([
      "semester", "winter", "custom", "summer",
    ])
  })

  it("has exactly one create action in the empty state", () => {
    render(<LearningPeriodView periods={[]} tasks={[]} today="2027-02-21" />)

    expect(screen.getAllByRole("button", { name: "创建第一个学期或假期" })).toHaveLength(1)
  })

  it("keeps a historical period read-only while retaining an explicit accessible task-edit action", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const onEdit = vi.fn()
    const onEditTask = vi.fn()
    render(
      <LearningPeriodView
        onDelete={onDelete}
        onEdit={onEdit}
        onEditTask={onEditTask}
        periods={[period({ id: "history", endDate: "2027-01-16" })]}
        selectedPeriodId="history"
        tasks={[task({ id: "history-task", scheduledDate: "2027-01-16" })]}
        today="2027-01-17"
      />,
    )

    expect(screen.queryByRole("button", { name: "编辑周期" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "删除周期" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "编辑任务：复习导数" }))
    expect(onEditTask).toHaveBeenCalledWith(expect.objectContaining({ id: "history-task" }))
    expect(onEdit).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("treats a period ending today as current and leaves period management available", () => {
    render(
      <LearningPeriodView
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        periods={[period({ id: "today", endDate: "2027-01-16" })]}
        selectedPeriodId="today"
        tasks={[]}
        today="2027-01-16"
      />,
    )

    expect(screen.getByRole("button", { name: "编辑周期" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "删除周期" })).toBeInTheDocument()
  })
})
