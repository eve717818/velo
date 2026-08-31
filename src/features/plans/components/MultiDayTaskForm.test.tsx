import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PlanTaskGroup } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import { createPlanTaskGroup } from "../data/plan-task-group-service"
import { TaskEditorDialog } from "./TaskEditorDialog"

function createDatabase() {
  return new VeloDB(`velo-multi-day-editor-${crypto.randomUUID()}`)
}

function renderEditor(db: VeloDB, taskGroup?: PlanTaskGroup) {
  return render(
    <TaskEditorDialog
      db={db}
      initialDate="2026-09-01"
      onClose={vi.fn()}
      open
      taskGroup={taskGroup}
    />,
  )
}

async function selectMultiDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "跨日任务" }))
}

async function fillCoreFields(
  user: ReturnType<typeof userEvent.setup>,
  { endDate = "2026-09-07", sessionCount = "3", title = "完成高数第三章" } = {},
) {
  await user.type(screen.getByLabelText("任务名称"), title)
  await user.clear(screen.getByLabelText("截止日期"))
  await user.type(screen.getByLabelText("截止日期"), endDate)
  await user.clear(screen.getByLabelText("学习次数"))
  await user.type(screen.getByLabelText("学习次数"), sessionCount)
}

describe("MultiDayTaskForm", () => {
  it("keeps range validation adjacent and does not write an impossible schedule", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderEditor(db)

    try {
      await selectMultiDay(user)
      await fillCoreFields(user, { endDate: "2026-09-02", sessionCount: "3" })
      await user.click(screen.getByRole("button", { name: "保存跨日任务" }))

      expect(screen.getByText("学习次数不能超过周期天数")).toBeVisible()
      expect(screen.getByLabelText("学习次数")).toHaveAttribute("aria-invalid", "true")
      expect(await db.planTaskGroups.count()).toBe(0)

      await user.clear(screen.getByLabelText("开始日期"))
      await user.type(screen.getByLabelText("开始日期"), "2026-09-03")
      expect(screen.getByText("开始日期不能晚于截止日期")).toBeVisible()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("recommends a lighter day and saves the exact edited preview", async () => {
    const db = createDatabase()
    await db.planTasks.bulkAdd([
      { id: "busy-1", title: "忙碌一", scheduledDate: "2026-09-04", estimatedMinutes: 120, isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 },
      { id: "busy-2", title: "忙碌二", scheduledDate: "2026-09-04", estimatedMinutes: 60, isCompleted: 0, order: 2, createdAt: 1, updatedAt: 1 },
    ])
    const user = userEvent.setup()
    const rendered = renderEditor(db)

    try {
      await selectMultiDay(user)
      await fillCoreFields(user)

      await waitFor(() => expect(screen.getByLabelText("第 2 次日期")).toHaveValue("2026-09-03"))
      expect(screen.getAllByText(/当天已有 0 项/)).toHaveLength(3)
      fireEvent.change(screen.getByLabelText("第 2 次日期"), { target: { value: "2026-09-05" } })
      fireEvent.change(screen.getByLabelText("第 2 次标题"), { target: { value: "极限与连续" } })
      await user.click(screen.getByRole("button", { name: "保存跨日任务" }))

      await waitFor(async () => {
        const savedGroup = await db.planTaskGroups.toCollection().first()
        const saved = await db.planTasks
          .where("[groupId+stepIndex]")
          .between([savedGroup!.id, 1], [savedGroup!.id, 3], true, true)
          .toArray()
        expect(saved).toEqual([
          expect.objectContaining({ scheduledDate: "2026-09-01", stepIndex: 1 }),
          expect.objectContaining({ scheduledDate: "2026-09-05", title: "极限与连续", stepIndex: 2, stepTitleMode: "custom" }),
          expect.objectContaining({ scheduledDate: "2026-09-07", stepIndex: 3 }),
        ])
      })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("preserves entered fields and retries the same multi-day input after a write error", async () => {
    const db = createDatabase()
    let shouldFail = true
    db.planTaskGroups.hook("creating", () => {
      if (shouldFail) throw new Error("磁盘写入失败")
    })
    const user = userEvent.setup()
    const rendered = renderEditor(db)

    try {
      await selectMultiDay(user)
      await fillCoreFields(user)
      await user.click(screen.getByRole("button", { name: "保存跨日任务" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      expect(screen.getByLabelText("任务名称")).toHaveValue("完成高数第三章")
      expect(screen.getByLabelText("学习次数")).toHaveValue(3)

      shouldFail = false
      await user.click(screen.getByRole("button", { name: "重试" }))
      await waitFor(async () => expect(await db.planTaskGroups.count()).toBe(1))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("edits a group without moving completed steps or overwriting custom titles", async () => {
    const db = createDatabase()
    const created = await createPlanTaskGroup(
      db,
      {
        title: "高数第三章",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        sessionCount: 3,
        steps: [
          { scheduledDate: "2026-09-01", title: "高数第三章", stepIndex: 1, stepTitleMode: "inherit" },
          { scheduledDate: "2026-09-04", title: "极限与连续", stepIndex: 2, stepTitleMode: "custom" },
          { scheduledDate: "2026-09-07", title: "高数第三章", stepIndex: 3, stepTitleMode: "inherit" },
        ],
      },
      100,
    )
    await db.planTasks.update(created.tasks[0].id, { isCompleted: 1, completedAt: 110 })
    const user = userEvent.setup()
    const rendered = renderEditor(db, created.group)

    try {
      expect(await screen.findByLabelText("任务名称")).toHaveValue("高数第三章")
      await user.clear(screen.getByLabelText("任务名称"))
      await user.type(screen.getByLabelText("任务名称"), "高数第三章总复习")

      expect(screen.getByLabelText("第 1 次日期")).toHaveValue("2026-09-01")
      expect(screen.getByLabelText("第 1 次标题")).toHaveValue("高数第三章")
      expect(screen.getByLabelText("第 2 次标题")).toHaveValue("极限与连续")
      expect(screen.getByLabelText("第 3 次标题")).toHaveValue("高数第三章总复习")
      await user.click(screen.getByRole("button", { name: "保存跨日任务" }))

      await waitFor(async () => {
        expect(await db.planTasks.get(created.tasks[0].id)).toMatchObject({
          scheduledDate: "2026-09-01",
          title: "高数第三章",
          isCompleted: 1,
        })
        expect(await db.planTasks.get(created.tasks[1].id)).toMatchObject({ title: "极限与连续" })
        expect(await db.planTasks.get(created.tasks[2].id)).toMatchObject({ title: "高数第三章总复习" })
      })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
