import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod } from "@/db/types"

import { PlanPeriodNavigator } from "./PlanPeriodNavigator"

const periods: LearningPeriod[] = [
  { id: "fall", kind: "semester", name: "2026 秋季学期", startDate: "2026-09-01", endDate: "2027-01-15", createdAt: 1, updatedAt: 1 },
  { id: "winter", kind: "winter-break", name: "寒假", startDate: "2027-01-16", endDate: "2027-02-20", createdAt: 1, updatedAt: 1 },
]

describe("PlanPeriodNavigator", () => {
  it("offers creation instead of an empty semester selector", () => {
    render(<PlanPeriodNavigator scope="semester" selectedDate="2026-09-04" periods={[]} />)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "新建学期或假期" })).toBeVisible()
    expect(screen.getByText("还没有学期或假期，请先新建。" )).toBeVisible()
  })

  it.each([
    ["day", "上一日", "下一日", "2026-09-02"],
    ["week", "上一周", "下一周", "2026-09-08"],
    ["month", "上一月", "下一月", "2026-10-01"],
  ] as const)("moves the %s selection with accessible controls", async (scope, previousName, nextName, expectedDate) => {
    const onDateChange = vi.fn()
    const user = userEvent.setup()
    render(<PlanPeriodNavigator onDateChange={onDateChange} scope={scope} selectedDate="2026-09-01" />)

    await user.click(screen.getByRole("button", { name: nextName }))

    expect(screen.getByRole("button", { name: previousName })).toBeInTheDocument()
    expect(onDateChange).toHaveBeenCalledWith(expectedDate)
  })

  it("shows the week label from the selected date", () => {
    render(<PlanPeriodNavigator scope="week" selectedDate="2026-09-01" />)

    expect(screen.getByRole("heading", { name: "8月31日—9月6日" })).toBeInTheDocument()
  })

  it("selects a semester or holiday and exposes period management", async () => {
    const onPeriodChange = vi.fn()
    const onManagePeriods = vi.fn()
    const user = userEvent.setup()
    render(
      <PlanPeriodNavigator
        onManagePeriods={onManagePeriods}
        onPeriodChange={onPeriodChange}
        period={periods[0]}
        periods={periods}
        scope="semester"
        selectedDate="2026-09-01"
      />,
    )

    expect(screen.getByRole("option", { name: "2026 秋季学期" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "寒假" })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("选择学期或假期"), "winter")
    await user.click(screen.getByRole("button", { name: "管理学期与假期" }))

    expect(onPeriodChange).toHaveBeenCalledWith("winter")
    expect(onManagePeriods).toHaveBeenCalledOnce()
  })
})
