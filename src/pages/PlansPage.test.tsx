import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { PlansPage } from "./PlansPage"

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前位置">{`${location.pathname}${location.search}`}</output>
}

function createDatabase() {
  return new VeloDB(`velo-plans-page-${crypto.randomUUID()}`)
}

function renderPlansPage(initialEntry: string, db: VeloDB) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PlansPage db={db} now={new Date(2026, 8, 2, 9, 0)} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "fall",
    kind: "semester",
    name: "2026 秋季学期",
    startDate: "2026-09-01",
    endDate: "2027-01-16",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "默认任务",
    scope: "day",
    periodKey: "2026-09-02",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("PlansPage", () => {
  it.each([
    ["day", "2026-09-02", undefined, "日任务", "待安排任务"],
    ["week", "2026-09-02", undefined, "周任务", "本周任务"],
    ["month", "2026-09-02", undefined, "月任务", "本月任务"],
    ["period", "2026-09-02", "fall", "学期任务", "本学期任务"],
  ] as const)("renders only the selected %s workspace", async (view, date, periodId, matchingTitle, regionName) => {
    const db = createDatabase()
    await db.learningPeriods.add(period())
    await db.planTasks.bulkAdd([
      task({ id: "day", title: "日任务", scope: "day", periodKey: "2026-09-02" }),
      task({ id: "week", title: "周任务", scope: "week", periodKey: "2026-08-31" }),
      task({ id: "month", title: "月任务", scope: "month", periodKey: "2026-09" }),
      task({ id: "semester", title: "学期任务", scope: "semester", periodKey: "fall" }),
    ])
    const query = new URLSearchParams({ view, date })
    if (periodId) query.set("period", periodId)
    const rendered = renderPlansPage(`/plans?${query.toString()}`, db)

    try {
      expect(await screen.findByRole("region", { name: regionName })).toHaveTextContent(matchingTitle)
      for (const title of ["日任务", "周任务", "月任务", "学期任务"]) {
        if (title !== matchingTitle) expect(screen.queryByText(title)).not.toBeInTheDocument()
      }
      expect(screen.queryByLabelText("本周排程")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
      expect(screen.queryByText("制定本周计划")).not.toBeInTheDocument()
      expect(screen.queryByText("制定本月计划")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("opens a month editor locked to the active month key", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=month&date=2026-09-02", db)

    try {
      await user.click(await screen.findByRole("link", { name: "新建任务" }))
      const dialog = screen.getByRole("dialog", { name: "新建学习任务" })
      expect(dialog).toHaveTextContent("所属月")
      expect(screen.getByLabelText("所属月")).toHaveValue("2026-09")
      await user.type(screen.getByLabelText("任务标题"), "月度复盘")
      await user.click(screen.getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.where("[scope+periodKey]").equals(["month", "2026-09"]).count()).toBe(1))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps an invalid semester route recoverable through the selector without a save entry point", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    await db.learningPeriods.add(period())
    const rendered = renderPlansPage("/plans?view=period&date=2026-09-02&period=missing", db)

    try {
      expect(await screen.findByText("选择一个学期或假期")).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: "新建任务" })).not.toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText("选择学期或假期"), "fall")
      expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=period&date=2026-09-02&period=fall")
      expect(await screen.findByRole("link", { name: "新建任务" })).toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
