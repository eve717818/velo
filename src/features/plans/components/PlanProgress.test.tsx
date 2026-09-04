import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { PlanTask } from "@/db/types"

import { PlanProgress } from "./PlanProgress"

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "复习导数",
    scope: "week",
    periodKey: "2026-08-31",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("PlanProgress", () => {
  it.each([
    ["day", "今日任务已全部完成"],
    ["week", "本周任务已全部完成"],
    ["month", "本月任务已全部完成"],
    ["period", "本学期任务已全部完成"],
  ] as const)("uses specific completed copy for %s", (view, copy) => {
    render(<PlanProgress tasks={[task({ isCompleted: 1 })]} view={view} />)
    expect(screen.getByText(copy)).toBeInTheDocument()
  })

  it("derives progress only from the active workspace snapshot", () => {
    render(<PlanProgress tasks={[task({ scope: "week" }), task({ id: "done", isCompleted: 1 })]} view="week" />)

    expect(screen.getByText("1 / 2")).toBeInTheDocument()
    expect(screen.getByText("已完成 1 项，还有 1 项")).toBeInTheDocument()
  })
})
