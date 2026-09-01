import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PlanProgress } from "./PlanProgress"

describe("PlanProgress", () => {
  it.each([
    ["day", "今日任务已全部完成"],
    ["week", "本周任务已全部完成"],
    ["month", "本月任务已全部完成"],
    ["period", "本学期任务已全部完成"],
  ] as const)("uses specific completed copy for %s", (view, copy) => {
    render(<PlanProgress completed={2} total={2} view={view} />)
    expect(screen.getByText(copy)).toBeInTheDocument()
  })

  it("explains empty and partial ranges precisely", () => {
    const rendered = render(<PlanProgress completed={0} total={0} view="month" />)
    expect(screen.getByText("当前还没有任务")).toBeInTheDocument()
    rendered.rerender(<PlanProgress completed={2} total={5} view="month" />)
    expect(screen.getByText("已完成 2 项，还有 3 项")).toBeInTheDocument()
  })
})
