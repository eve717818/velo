import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { PlanHeader } from "./PlanHeader"

describe("PlanHeader", () => {
  it("keeps the product heading and creation link without a global date control", () => {
    render(<MemoryRouter><PlanHeader createHref="/plans/new" /></MemoryRouter>)

    expect(screen.getByRole("heading", { name: "学习计划" })).toBeInTheDocument()
    expect(screen.getByText("分层安排任务，保持清晰节奏。")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "新建任务" })).toHaveAttribute("href", "/plans/new")
    expect(screen.queryByLabelText("计划日期")).not.toBeInTheDocument()
  })
})
