import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it } from "vitest"
import type { LearningPeriod } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import { PlansPage } from "./PlansPage"

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前位置">{`${location.pathname}${location.search}`}</output>
}

function createDatabase() {
  return new VeloDB(`velo-plans-page-${crypto.randomUUID()}`)
}

function renderPlansPage(initialEntry: string, db: VeloDB, now = new Date(2026, 7, 29, 9, 0)) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PlansPage db={db} now={now} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe("PlansPage", () => {
  it("switches among all plan views while keeping the selected date in the URL", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-28", db)

    try {
      expect(await screen.findByText("0 / 0")).toBeInTheDocument()
      for (const label of ["日", "周", "月", "周期"]) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
      }

      await user.click(screen.getByRole("button", { name: "月" }))

      expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=month&date=2026-08-28")
      expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("canonicalizes invalid view and date values to the local-day fallback", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=agenda&date=2026-02-31", db)

    try {
      await waitFor(() => {
        expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=day&date=2026-08-29")
      })
      expect(screen.getByRole("button", { name: "日" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("计划日期")).toHaveValue("2026-08-29")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("exposes the current shell task lane as an untimed date drop zone", async () => {
    const db = createDatabase()
    await db.planTasks.add({
      id: "drop-zone-task",
      title: "复习导数",
      scheduledDate: "2026-08-29",
      isCompleted: 0,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      expect(await screen.findByText("复习导数")).toBeInTheDocument()
      expect(screen.getByTestId("current-plan-drop-zone")).toHaveAttribute("data-drop-date", "2026-08-29")
      expect(screen.getByTestId("current-plan-drop-zone")).not.toHaveAttribute("data-start-minutes")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps one new-task entry point for an empty day across the complete page", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      expect(await screen.findByText("今天还没有安排")).toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: "新建任务" })).toHaveLength(1)
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("offers only the period-creation action for an empty learning-period workspace", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=period&date=2026-08-29", db)

    try {
      expect(await screen.findByRole("button", { name: "创建第一个学期或假期" })).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: "新建任务" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("opens a historical period task through the existing task editor while keeping period management read-only", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const historicalPeriod: LearningPeriod = {
      id: "history",
      kind: "semester",
      name: "2026 秋季学期",
      startDate: "2026-09-01",
      endDate: "2027-01-16",
      createdAt: 1,
      updatedAt: 1,
    }
    await db.learningPeriods.add(historicalPeriod)
    await db.planTasks.add({ id: "history-task", title: "历史复习", scheduledDate: "2027-01-16", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=period&period=history&date=2027-01-17", db, new Date(2027, 0, 17, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "编辑任务：历史复习" }))
      expect(screen.getByRole("heading", { name: "编辑学习任务" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "编辑周期" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "删除周期" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
