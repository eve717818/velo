import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as planTaskService from "../data/plan-task-service"
import * as periodMigrationService from "../data/period-migration-service"

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
      await waitFor(async () => expect(await db.appMeta.get("periodMigrationDismissed:source:target")).toMatchObject({ value: "1" }))
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

  it("keeps the selected tasks visible and retries the same copy selection after failure", async () => {
    const db = new VeloDB(`period-copy-retry-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rows = [task("one"), task("two")]
    const realCopy = planTaskService.copyTasksToPeriod
    const copySpy = vi.spyOn(planTaskService, "copyTasksToPeriod")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realCopy)
    await db.planTasks.bulkAdd(rows)
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={rows} today="2027-01-18" />)

    try {
      await user.click(screen.getByLabelText("选择任务 one"))
      await user.click(screen.getByLabelText("选择任务 two"))
      await user.click(screen.getByRole("button", { name: "复制 2 项任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      expect(screen.getByText("已选择 2 项")).toBeInTheDocument()
      await user.click(screen.getByLabelText("选择任务 two"))
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect((await db.planTasks.toArray()).filter((row) => row.scheduledDate === "2027-01-18")).toHaveLength(2))
      expect(copySpy).toHaveBeenCalledTimes(2)
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      copySpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("retries copy with the original task ids and target-period scheduling snapshot after props change", async () => {
    const db = new VeloDB(`period-copy-snapshot-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rows = [task("one"), task("two")]
    const realCopy = planTaskService.copyTasksToPeriod
    const copySpy = vi.spyOn(planTaskService, "copyTasksToPeriod")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realCopy)
    await db.planTasks.bulkAdd(rows)
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={rows} today="2027-01-18" />)

    try {
      await user.click(screen.getByLabelText("选择任务 one"))
      await user.click(screen.getByLabelText("选择任务 two"))
      await user.click(screen.getByRole("button", { name: "复制 2 项任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")

      rendered.rerender(
        <PeriodMigrationPanel
          db={db}
          onClose={onClose}
          open
          sourcePeriod={source}
          targetPeriod={{ ...target, startDate: "2027-03-01", endDate: "2027-03-31", updatedAt: 2 }}
          tasks={rows}
          today="2027-03-05"
        />,
      )
      await user.click(screen.getByLabelText("选择任务 two"))
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect((await db.planTasks.toArray()).filter((row) => row.scheduledDate === "2027-01-18")).toHaveLength(2))
      expect((await db.planTasks.toArray()).filter((row) => row.scheduledDate === "2027-03-05")).toHaveLength(0)
      expect(copySpy).toHaveBeenNthCalledWith(1, db, ["one", "two"], target, "2027-01-18", expect.any(Number))
      expect(copySpy).toHaveBeenNthCalledWith(2, db, ["one", "two"], target, "2027-01-18", expect.any(Number))
    } finally {
      copySpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("retries dismissing the migration after a failed dismiss request", async () => {
    const db = new VeloDB(`period-dismiss-retry-${crypto.randomUUID()}`)
    const user = userEvent.setup()
    const onClose = vi.fn()
    const realDismiss = periodMigrationService.dismissPeriodMigration
    const dismissSpy = vi.spyOn(periodMigrationService, "dismissPeriodMigration")
    dismissSpy
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realDismiss)
    const rendered = render(<PeriodMigrationPanel db={db} onClose={onClose} open sourcePeriod={source} targetPeriod={target} tasks={[]} today="2027-01-18" />)

    try {
      await user.click(screen.getByRole("button", { name: "暂不处理" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(dismissSpy).toHaveBeenCalledTimes(2)
    } finally {
      dismissSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })
})
