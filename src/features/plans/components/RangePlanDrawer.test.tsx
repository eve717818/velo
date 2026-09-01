import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { VeloDB } from "@/db/velo-db"

import { RangePlanDrawer } from "./RangePlanDrawer"

describe("RangePlanDrawer", () => {
  it("saves a weekly overall plan with focus items", async () => {
    const db = new VeloDB(`range-plan-drawer-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()

    try {
      render(<RangePlanDrawer completed={1} db={db} kind="week" onClose={onClose} open plan={null} selectedDate="2026-09-02" total={3} />)

      await user.type(screen.getByLabelText("计划主题"), "导数冲刺")
      await user.type(screen.getByLabelText("总体目标"), "完成导数章节复习")
      await user.type(screen.getByLabelText("重点事项 1"), "整理错题")
      await user.click(screen.getByRole("button", { name: "添加重点事项" }))
      await user.type(screen.getByLabelText("重点事项 2"), "完成章节测验")
      await user.click(screen.getByRole("button", { name: "保存本周计划" }))

      await waitFor(() => expect(onClose).toHaveBeenCalled())
      await expect(db.rangePlans.get("week:2026-08-31")).resolves.toMatchObject({
        theme: "导数冲刺",
        goal: "完成导数章节复习",
        focusItems: ["整理错题", "完成章节测验"],
      })
    } finally {
      await db.delete()
    }
  })

  it("shows field validation without closing", async () => {
    const db = new VeloDB(`range-plan-drawer-${crypto.randomUUID()}`)
    const user = userEvent.setup()

    try {
      render(<RangePlanDrawer completed={0} db={db} kind="month" onClose={() => undefined} open plan={null} selectedDate="2026-09-02" total={0} />)
      await user.click(screen.getByRole("button", { name: "保存本月计划" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("请输入计划主题")
      expect(screen.getByRole("dialog", { name: "制定本月计划" })).toBeInTheDocument()
    } finally {
      await db.delete()
    }
  })
})
