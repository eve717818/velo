import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { MonthPlanView } from "./MonthPlanView"

function task(): PlanTask {
  return { id: "month-task", title: "不应塞入单元格的完整标题", scope: "month", periodKey: "2028-02", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
}

describe("MonthPlanView compatibility surface", () => {
  it("keeps month tasks in one non-calendar list", async () => {
    const db = new VeloDB(`month-view-${crypto.randomUUID()}`)
    const rendered = render(<MonthPlanView db={db} selectedDate="2028-02-10" tasks={[task()]} />)
    try {
      expect(screen.getByLabelText("月计划兼容视图")).toHaveTextContent("不应塞入单元格的完整标题")
      expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
      expect(document.querySelector("[data-drop-date]")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
