import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod } from "@/db/types"

import { LearningPeriodView } from "./LearningPeriodView"

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "fall",
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

describe("LearningPeriodView", () => {
  it("is a compact period manager and leaves task rendering to the workspace list", () => {
    render(<LearningPeriodView periods={[period(), period({ id: "winter", kind: "winter-break", name: "寒假" })]} selectedPeriodId="fall" />)

    expect(screen.getByLabelText("学期与假期列表")).toHaveTextContent("2026 秋季学期")
    expect(screen.getByLabelText("学期与假期列表")).toHaveTextContent("寒假")
    expect(screen.queryByLabelText("学期或假期任务")).not.toBeInTheDocument()
    expect(screen.queryByText("未归属学期或假期")).not.toBeInTheDocument()
  })

  it("keeps create, selection, edit, delete, and migration entry points in the manager", async () => {
    const user = userEvent.setup()
    const selected = vi.fn()
    const onCreate = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onReopenMigration = vi.fn()
    const winter = period({ id: "winter", kind: "winter-break", name: "寒假", startDate: "2027-01-17", endDate: "2027-02-21" })
    render(<LearningPeriodView onCreate={onCreate} onDelete={onDelete} onEdit={onEdit} onReopenMigration={onReopenMigration} onSelect={selected} periods={[period(), winter]} selectedPeriodId="fall" />)

    await user.click(screen.getByRole("button", { name: "新建学期或假期" }))
    await user.click(screen.getByRole("button", { name: /寒假.*2027-01-17/ }))
    await user.click(screen.getByRole("button", { name: "更多学期操作" }))
    await user.click(screen.getByRole("menuitem", { name: "编辑学期或假期" }))
    await user.click(screen.getByRole("menuitem", { name: "删除学期或假期" }))
    await user.click(screen.getByRole("menuitem", { name: "处理上学期任务" }))

    expect(onCreate).toHaveBeenCalledOnce()
    expect(selected).toHaveBeenCalledWith(winter)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "fall" }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "fall" }))
    expect(onReopenMigration).toHaveBeenCalledWith(expect.objectContaining({ id: "fall" }))
  })
})
