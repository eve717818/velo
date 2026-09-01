import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { WeekPlanView } from "./WeekPlanView"

function task(): PlanTask {
  return { id: "week-task", title: "跨年复习", scope: "week", periodKey: "2026-12-28", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
}

describe("WeekPlanView compatibility surface", () => {
  it("keeps week tasks in one non-dated list without drop targets", async () => {
    const db = new VeloDB(`week-view-${crypto.randomUUID()}`)
    const rendered = render(<WeekPlanView db={db} selectedDate="2026-12-31" tasks={[task()]} />)
    try {
      expect(screen.getByLabelText("周计划兼容视图")).toHaveTextContent("跨年复习")
      expect(document.querySelector("[data-drop-date]")).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
