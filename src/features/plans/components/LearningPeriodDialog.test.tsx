import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as learningPeriodService from "../data/learning-period-service"

import { LearningPeriodDialog } from "./LearningPeriodDialog"

function existingPeriod(): LearningPeriod {
  return {
    id: "spring",
    kind: "semester",
    name: "春季学期",
    startDate: "2027-02-22",
    endDate: "2027-06-30",
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("LearningPeriodDialog", () => {
  it("creates a winter break with an optional goal and names the conflicting period in an inline date error", async () => {
    const db = new VeloDB(`period-dialog-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    await db.learningPeriods.add(existingPeriod())
    const rendered = render(<LearningPeriodDialog db={db} onClose={onClose} open periods={[existingPeriod()]} />)

    try {
      await user.selectOptions(screen.getByLabelText("周期类型"), "winter-break")
      await user.type(screen.getByLabelText("周期名称"), "寒假")
      await user.clear(screen.getByLabelText("开始日期"))
      await user.type(screen.getByLabelText("开始日期"), "2027-06-15")
      await user.clear(screen.getByLabelText("结束日期"))
      await user.type(screen.getByLabelText("结束日期"), "2027-07-15")
      await user.type(screen.getByLabelText("学习目标"), "复习线性代数")
      await user.click(screen.getByRole("button", { name: "保存周期" }))

      expect(await screen.findByText(/春季学期/)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("retries the last submitted period values after a failed save", async () => {
    const db = new VeloDB(`period-dialog-retry-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const realCreate = learningPeriodService.createLearningPeriod
    const createSpy = vi.spyOn(learningPeriodService, "createLearningPeriod")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realCreate)
    const rendered = render(<LearningPeriodDialog db={db} onClose={onClose} open periods={[]} />)

    try {
      await user.type(screen.getByLabelText("周期名称"), "寒假")
      await user.type(screen.getByLabelText("开始日期"), "2027-01-17")
      await user.type(screen.getByLabelText("结束日期"), "2027-02-21")
      await user.click(screen.getByRole("button", { name: "保存周期" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.clear(screen.getByLabelText("周期名称"))
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.learningPeriods.toArray()).toMatchObject([{ name: "寒假" }]))
      expect(createSpy).toHaveBeenCalledTimes(2)
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      createSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })
})
