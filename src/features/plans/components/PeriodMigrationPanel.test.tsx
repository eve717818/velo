import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { PeriodMigrationPanel } from "./PeriodMigrationPanel"
import { reopenPeriodMigration } from "../data/period-migration-service"

const source: LearningPeriod = { id: "source", kind: "semester", name: "秋季学期", startDate: "2026-09-01", endDate: "2027-01-16", createdAt: 1, updatedAt: 1 }
const target: LearningPeriod = { id: "target", kind: "winter-break", name: "寒假", startDate: "2027-01-17", endDate: "2027-02-21", createdAt: 1, updatedAt: 1 }

function task(id: string): PlanTask {
  return { id, title: `任务 ${id}`, scheduledDate: "2027-01-16", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
}

describe("PeriodMigrationPanel", () => {
  it("is a non-modal zero-selection prompt that copies only selected tasks without changing the sources", async () => {
    const db = new VeloDB(`period-migration-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rows = [task("one"), task("two"), task("three"), task("four")]
    await db.planTasks.bulkAdd(rows)
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={rows} today="2027-02-25" />)

    try {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(screen.getByText("已选择 0 项")).toBeInTheDocument()
      for (const id of ["one", "two", "three"]) await user.click(screen.getByLabelText(`选择任务 ${id}`))
      await user.click(screen.getByRole("button", { name: "复制 3 项任务" }))

      await waitFor(async () => expect((await db.planTasks.toArray()).filter((row) => row.scheduledDate === target.startDate)).toHaveLength(3))
      expect(await db.planTasks.bulkGet(["one", "two", "three", "four"])).toEqual(rows)
      expect(onClose).toHaveBeenCalled()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("stores dismissal and lets recovery clear it before reopening", async () => {
    const db = new VeloDB(`period-dismiss-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={[task("one")]} today="2027-01-18" />)

    try {
      await user.click(screen.getByRole("button", { name: "暂不处理" }))
      expect(await db.appMeta.get("periodMigrationDismissed:source:target")).toMatchObject({ value: "1" })
      await reopenPeriodMigration(db, source.id, target.id)
      expect(await db.appMeta.get("periodMigrationDismissed:source:target")).toBeUndefined()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps the copy action disabled and leaves the database untouched with zero selections", async () => {
    const db = new VeloDB(`period-zero-selection-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rows = [task("one")]
    await db.planTasks.bulkAdd(rows)
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={rows} today="2027-01-18" />)

    try {
      const copy = screen.getByRole("button", { name: "复制 0 项任务" })
      expect(copy).toBeDisabled()
      await user.click(copy)
      expect(await db.planTasks.toArray()).toEqual(rows)
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
