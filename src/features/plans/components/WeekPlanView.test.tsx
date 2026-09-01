import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PlanTask, PlanTaskGroup } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { WeekPlanView } from "./WeekPlanView"

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "跨年复习",
    scheduledDate: "2026-12-31",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("WeekPlanView", () => {
  it("keeps multi-day steps as regular week tasks without a spanning calendar band", () => {
    const db = new VeloDB(`week-view-${crypto.randomUUID()}`)
    const group: PlanTaskGroup = {
      id: "calculus-group",
      title: "高数第三章",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      sessionCount: 3,
      createdAt: 1,
      updatedAt: 1,
    }
    const tasks = [
      task({ groupId: group.id, id: "step-1", scheduledDate: "2026-09-01", stepIndex: 1, isCompleted: 1 }),
      task({ groupId: group.id, id: "step-2", scheduledDate: "2026-09-03", stepIndex: 2 }),
      task({ groupId: group.id, id: "step-3", scheduledDate: "2026-09-07", stepIndex: 3 }),
    ]
    const rendered = render(
      <WeekPlanView db={db} selectedDate="2026-09-03" taskGroups={[group]} tasks={tasks} />,
    )

    try {
      expect(screen.queryByTestId("week-task-group-segment")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /高数第三章.*9月1日至9月7日.*1\/3/ })).not.toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: "打开任务操作：跨年复习" }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByLabelText("2026年9月3日，星期四任务")).toHaveTextContent("第 2/3 次")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("provides seven selectable mobile dates and a selected-day task list across a year boundary", () => {
    const db = new VeloDB(`week-view-${crypto.randomUUID()}`)
    const rendered = render(<WeekPlanView db={db} selectedDate="2026-12-31" tasks={[task()]} />)

    try {
      expect(screen.getAllByRole("button", { name: /2026年12月|2027年1月/ })).toHaveLength(7)
      expect(screen.getByRole("button", { name: "2026年12月31日，星期四" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("2026年12月31日，星期四任务")).toHaveTextContent("跨年复习")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("exposes seven dated tablet drop zones", () => {
    const db = new VeloDB(`week-view-${crypto.randomUUID()}`)
    const rendered = render(<WeekPlanView db={db} selectedDate="2026-12-31" tasks={[]} />)

    try {
      const zones = document.querySelectorAll("[data-drop-date]")
      expect(zones).toHaveLength(7)
      expect(zones[0]).toHaveAttribute("data-drop-date", "2026-12-28")
      expect(zones[6]).toHaveAttribute("data-drop-date", "2027-01-03")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("resets the active mobile day when the workspace date changes", () => {
    const db = new VeloDB(`week-view-${crypto.randomUUID()}`)
    const rendered = render(<WeekPlanView db={db} selectedDate="2026-12-31" tasks={[]} />)

    try {
      rendered.rerender(<WeekPlanView db={db} selectedDate="2027-01-07" tasks={[]} />)
      expect(screen.getByRole("button", { name: "2027年1月7日，星期四" })).toHaveAttribute("aria-pressed", "true")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })
})
