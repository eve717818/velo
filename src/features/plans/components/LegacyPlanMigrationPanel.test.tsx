import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { LegacyPlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { LegacyPlanMigrationPanel } from "./LegacyPlanMigrationPanel"

const legacy: LegacyPlanTask = {
  id: "legacy-week",
  scope: "week",
  periodKey: "2027-W03",
  title: "旧的周计划",
  isCompleted: 0,
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

describe("LegacyPlanMigrationPanel", () => {
  it("requires a real calendar date and only deletes the legacy row after its v2 task is created", async () => {
    const db = new VeloDB(`legacy-panel-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    await db.legacyPlanTasks.add(legacy)
    const rendered = render(<LegacyPlanMigrationPanel db={db} legacyTasks={[legacy]} open />)

    try {
      await user.click(screen.getByRole("button", { name: "转换为学习任务" }))
      expect(screen.getByText("请选择有效日期")).toBeInTheDocument()
      expect(await db.legacyPlanTasks.get(legacy.id)).toEqual(legacy)

      await user.clear(screen.getByLabelText("安排日期"))
      await user.type(screen.getByLabelText("安排日期"), "2027-02-30")
      await user.click(screen.getByRole("button", { name: "转换为学习任务" }))
      expect(screen.getByText("请选择有效日期")).toBeInTheDocument()
      expect(await db.legacyPlanTasks.get(legacy.id)).toEqual(legacy)

      await user.clear(screen.getByLabelText("安排日期"))
      await user.type(screen.getByLabelText("安排日期"), "2027-02-20")
      await user.click(screen.getByRole("button", { name: "转换为学习任务" }))
      await waitFor(async () => expect(await db.legacyPlanTasks.get(legacy.id)).toBeUndefined())
      expect((await db.planTasks.toArray())[0]).toMatchObject({
        title: legacy.title,
        scope: "day",
        periodKey: "2027-02-20",
      })
      expect((await db.planTasks.toArray())[0].startMinutes).toBeUndefined()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
