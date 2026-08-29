import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { MonthPlanView } from "./MonthPlanView"

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "不应塞入单元格的完整标题",
    scheduledDate: "2028-02-29",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("MonthPlanView", () => {
  it("uses a leap-month grid with counts rather than task titles and opens the chosen day list", async () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const rendered = render(<MonthPlanView db={db} selectedDate="2028-02-10" tasks={[task(), task({ id: "done", isCompleted: 1 })]} />)

    try {
      const leapDay = screen.getByRole("button", { name: "2028年2月29日，2 项任务，1 项完成" })
      expect(leapDay).toBeInTheDocument()
      expect(screen.queryByText("不应塞入单元格的完整标题")).not.toBeInTheDocument()

      await user.click(leapDay)
      expect(screen.getByLabelText("2028年2月29日任务")).toHaveTextContent("不应塞入单元格的完整标题")
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })

  it("moves the selected day panel with a changed workspace date", () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const rendered = render(<MonthPlanView db={db} selectedDate="2028-02-10" tasks={[]} />)

    try {
      rendered.rerender(<MonthPlanView db={db} selectedDate="2028-03-04" tasks={[]} />)
      expect(screen.getByRole("button", { name: "2028年3月4日，0 项任务，0 项完成" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("2028年3月4日任务")).toBeInTheDocument()
    } finally {
      rendered.unmount()
      void db.delete()
    }
  })
})
