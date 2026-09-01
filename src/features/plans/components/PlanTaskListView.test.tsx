import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { PlanTaskListView } from "./PlanTaskListView"

function task(scope: Exclude<PlanTask["scope"], "day">, overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: `${scope}-task`,
    title: "复习导数",
    scope,
    periodKey: scope === "month" ? "2026-09" : scope === "week" ? "2026-08-31" : "fall",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

async function withDatabase(run: (db: VeloDB) => void | Promise<void>) {
  const db = new VeloDB(`velo-plan-list-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

describe("PlanTaskListView", () => {
  it("renders a month task as one task list without a calendar", async () => {
    await withDatabase((db) => {
      const monthTask = task("month")
      const rendered = render(<PlanTaskListView db={db} periodKey="2026-09" scope="month" tasks={[monthTask]} onCreate={vi.fn()} />)
      try {
        expect(screen.getByRole("region", { name: "本月任务" })).toHaveTextContent(monthTask.title)
        expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: `打开任务操作：${monthTask.title}` })).toBeInTheDocument()
      } finally {
        rendered.unmount()
      }
    })
  })

  it.each([
    ["week", "2026-08-31", "本周还没有任务。"],
    ["month", "2026-09", "本月还没有任务。"],
    ["semester", "fall", "当前学期或假期还没有任务。"],
  ] as const)("shows the %s empty state and create action", async (scope, periodKey, emptyCopy) => {
    await withDatabase(async (db) => {
      const onCreate = vi.fn()
      const user = userEvent.setup()
      const rendered = render(<PlanTaskListView db={db} onCreate={onCreate} periodKey={periodKey} scope={scope} tasks={[]} />)
      try {
        expect(screen.getByText(emptyCopy)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "新建任务" }))
        expect(onCreate).toHaveBeenCalledOnce()
      } finally {
        rendered.unmount()
      }
    })
  })
})
