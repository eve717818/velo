import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as learningPeriodService from "@/features/plans/data/learning-period-service"
import * as planTaskService from "@/features/plans/data/plan-task-service"
import * as periodMigrationService from "@/features/plans/data/period-migration-service"
import { PlansPage } from "./PlansPage"

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前位置">{`${location.pathname}${location.search}`}</output>
}

function createDatabase() {
  return new VeloDB(`velo-plans-page-${crypto.randomUUID()}`)
}

function renderPlansPage(initialEntry: string, db: VeloDB, now = new Date(2026, 7, 29, 9, 0)) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PlansPage db={db} now={now} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "spring",
    kind: "semester",
    name: "春季学期",
    startDate: "2027-02-22",
    endDate: "2027-06-30",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("PlansPage", () => {
  it.each([
    ["week", "2026-09-02", "2026-08-31", "本周任务"],
    ["month", "2026-09-02", "2026-09", "本月任务"],
  ] as const)("renders the %s workspace as the shared task-list boundary", async (view, date, periodKey, regionName) => {
    const db = createDatabase()
    const title = `${view} 任务`
    await db.planTasks.add({
      id: `${view}-task`,
      title,
      scope: view,
      periodKey,
      isCompleted: 0,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const rendered = renderPlansPage(`/plans?view=${view}&date=${date}`, db, new Date(2026, 8, 2, 9, 0))

    try {
      expect(await screen.findByRole("region", { name: regionName })).toHaveTextContent(title)
      expect(screen.getByRole("button", { name: `打开任务操作：${title}` })).toBeInTheDocument()
      expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("本周排程")).not.toBeInTheDocument()
      expect(screen.queryByTestId("week-task-group-segment")).not.toBeInTheDocument()
      expect(screen.queryByTestId("month-task-group-segment")).not.toBeInTheDocument()
      expect(screen.queryByText(/第 \d+\/\d+ 次/)).not.toBeInTheDocument()
      expect(document.querySelector("[data-drop-date]")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("switches among all plan views while keeping the selected date in the URL", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-28", db)

    try {
      expect(await screen.findByText("0 / 0")).toBeInTheDocument()
      for (const label of ["日", "周", "月", "学期"]) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
      }

      await user.click(screen.getByRole("button", { name: "月" }))

      expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=month&date=2026-08-28")
      expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("opens the weekly overall-plan drawer from the range summary", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=week&date=2026-09-02", db)

    try {
      await user.click(await screen.findByRole("button", { name: "制定本周计划" }))
      expect(screen.getByRole("dialog", { name: "制定本周计划" })).toBeInTheDocument()
      expect(screen.getByText("本周任务 0 项 · 已完成 0 项")).toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("canonicalizes invalid view and date values to the local-day fallback", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=agenda&date=2026-02-31", db)

    try {
      await waitFor(() => {
        expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=day&date=2026-08-29")
      })
      expect(screen.getByRole("button", { name: "日" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("计划日期")).toHaveValue("2026-08-29")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("exposes the current shell task lane with its scoped period key", async () => {
    const db = createDatabase()
    await db.planTasks.add({
      id: "drop-zone-task",
      title: "复习导数",
      scope: "day",
      periodKey: "2026-08-29",
      isCompleted: 0,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      expect(await screen.findByText("复习导数")).toBeInTheDocument()
      expect(screen.getByTestId("current-plan-drop-zone")).toHaveAttribute("data-drop-period-key", "2026-08-29")
      expect(screen.getByTestId("current-plan-drop-zone")).not.toHaveAttribute("data-drop-date")
      expect(screen.getByTestId("current-plan-drop-zone")).not.toHaveAttribute("data-start-minutes")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps one new-task entry point for an empty day across the complete page", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      expect(await screen.findByText("今天还没有安排")).toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: "新建任务" })).toHaveLength(1)
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("offers only the period-creation action for an empty learning-period workspace", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=period&date=2026-08-29", db)

    try {
      expect(await screen.findByRole("button", { name: "创建第一个学期或假期" })).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: "新建任务" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps a period-creation entry point after a learning period exists", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    await db.learningPeriods.add(period({ id: "fall", name: "2026 秋季学期", startDate: "2026-09-01", endDate: "2027-01-16" }))
    const rendered = renderPlansPage("/plans?view=period&period=fall&date=2026-09-02", db, new Date(2026, 8, 2, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "新建学期或假期" }))
      expect(screen.getByRole("dialog", { name: "新建学期或假期" })).toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("opens a historical period task through the existing task editor while keeping period management read-only", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const historicalPeriod: LearningPeriod = {
      id: "history",
      kind: "semester",
      name: "2026 秋季学期",
      startDate: "2026-09-01",
      endDate: "2027-01-16",
      createdAt: 1,
      updatedAt: 1,
    }
    await db.learningPeriods.add(historicalPeriod)
    await db.planTasks.add({ id: "history-task", title: "历史复习", scheduledDate: "2027-01-16", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=period&period=history&date=2027-01-17", db, new Date(2027, 0, 17, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "编辑任务：历史复习" }))
      expect(screen.getByRole("heading", { name: "编辑学习任务" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "编辑周期" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "删除周期" })).not.toBeInTheDocument()
      expect(screen.queryByText(/上一个学期或假期还有/)).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "处理上周期任务" })).not.toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("shows a reopen error and retries the same period migration intent", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const source = period({ id: "source", name: "秋季学期", startDate: "2026-09-01", endDate: "2027-01-16" })
    const target = period({ id: "spring", name: "寒假", startDate: "2027-01-17", endDate: "2027-02-21" })
    const realReopen = periodMigrationService.reopenPeriodMigration
    const reopenSpy = vi.spyOn(periodMigrationService, "reopenPeriodMigration")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realReopen)
    await db.learningPeriods.bulkAdd([source, target])
    await db.planTasks.add({ id: "migration-task", title: "迁移任务", scheduledDate: "2027-01-16", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    await db.appMeta.put({ key: "periodMigrationDismissed:source:spring", value: "1", updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=period&period=spring&date=2027-01-18", db, new Date(2027, 0, 18, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "更多学期操作" }))
      await user.click(screen.getByRole("menuitem", { name: "处理上学期任务" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.appMeta.get("periodMigrationDismissed:source:spring")).toBeUndefined())
      expect(await screen.findByRole("complementary", { name: "上学期任务迁移" })).toBeInTheDocument()
      expect(reopenSpy).toHaveBeenNthCalledWith(1, db, "source", "spring")
      expect(reopenSpy).toHaveBeenNthCalledWith(2, db, "source", "spring")
    } finally {
      reopenSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("does not let a stale reopen request open or error a newer period session", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const pendingReopen = deferred<void>()
    const reopenSpy = vi.spyOn(periodMigrationService, "reopenPeriodMigration").mockImplementationOnce(() => pendingReopen.promise)
    const source = period({ id: "source", name: "秋季学期", startDate: "2026-09-01", endDate: "2027-01-16" })
    const firstTarget = period({ id: "first-target", name: "寒假", startDate: "2027-01-17", endDate: "2027-02-21" })
    const secondTarget = period({ id: "second-target", name: "春季学期", startDate: "2027-02-22", endDate: "2027-06-30" })
    await db.learningPeriods.bulkAdd([source, firstTarget, secondTarget])
    await db.planTasks.add({ id: "migration-task", title: "迁移任务", scheduledDate: "2027-01-16", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    await db.appMeta.bulkPut([
      { key: "periodMigrationDismissed:source:first-target", value: "1", updatedAt: 1 },
      { key: "periodMigrationDismissed:first-target:second-target", value: "1", updatedAt: 1 },
    ])
    const rendered = renderPlansPage("/plans?view=period&period=first-target&date=2027-01-18", db, new Date(2027, 0, 18, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "更多学期操作" }))
      await user.click(screen.getByRole("menuitem", { name: "处理上学期任务" }))
      await user.click(screen.getByRole("button", { name: /春季学期.*2027-02-22/ }))
      await act(async () => {
        pendingReopen.resolve()
        await pendingReopen.promise
      })

      expect(screen.getByRole("heading", { name: "春季学期", level: 3 })).toBeInTheDocument()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(screen.queryByRole("complementary", { name: "上学期任务迁移" })).not.toBeInTheDocument()
    } finally {
      reopenSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("uses the shared focus URL when starting focus from task actions", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    await db.planTasks.add({ id: "task & focus", title: "复习导数", scheduledDate: "2026-08-29", estimatedMinutes: 45, isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      await user.click(await screen.findByRole("button", { name: "打开任务操作：复习导数" }))
      await user.click(screen.getByRole("button", { name: "开始专注" }))
      expect(screen.getByLabelText("当前位置")).toHaveTextContent("/focus?task=task+%26+focus&minutes=45")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("completes then restores a task through the action menu and live query", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const currentTask: PlanTask = { id: "menu-completion", title: "复习导数", scheduledDate: "2026-08-29", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
    await db.planTasks.add(currentTask)
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      await user.click(await screen.findByRole("button", { name: "打开任务操作：复习导数" }))
      await user.click(screen.getByRole("button", { name: "标记为完成" }))
      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 1 }))

      await user.click(await screen.findByRole("button", { name: "已完成：复习导数" }))
      await user.click(screen.getByRole("button", { name: "恢复为未完成" }))
      await waitFor(async () => expect(await db.planTasks.get(currentTask.id)).toMatchObject({ isCompleted: 0, completedAt: undefined }))
      expect(await screen.findByRole("button", { name: "打开任务操作：复习导数" })).toBeInTheDocument()
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("opens the existing task editor from the move action and saves a new date", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    await db.planTasks.add({ id: "task-to-move", title: "复习导数", scheduledDate: "2026-08-29", estimatedMinutes: 45, isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      await user.click(await screen.findByRole("button", { name: "打开任务操作：复习导数" }))
      await user.click(screen.getByRole("button", { name: "移动到日期/时间" }))

      const dialog = screen.getByRole("dialog", { name: "编辑学习任务" })
      expect(dialog).toBeInTheDocument()
      await user.clear(within(dialog).getByLabelText("日期"))
      await user.type(within(dialog).getByLabelText("日期"), "2026-08-30")
      await user.click(within(dialog).getByRole("button", { name: "保存任务" }))

      await waitFor(async () => expect(await db.planTasks.get("task-to-move")).toMatchObject({ scheduledDate: "2026-08-30" }))
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("keeps a cross-date move undo notice at the workspace level after the task leaves the current view", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    await db.planTasks.add({ id: "cross-date-task", title: "复习导数", scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=month&date=2026-08-30", db, new Date(2026, 7, 30, 9, 0))
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")

    try {
      const taskButton = await screen.findByRole("button", { name: "打开任务操作：复习导数" })
      const targetDay = screen.getByRole("button", { name: "2026年8月31日，0 项任务，0 项完成" })
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetDay })

      fireEvent.pointerDown(taskButton, { pointerId: 1, clientX: 20, clientY: 30 })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)) })
      await waitFor(() => expect(screen.getByTestId("task-drag-layer")).toBeInTheDocument())
      fireEvent.pointerUp(taskButton, { pointerId: 1, clientX: 42, clientY: 30 })

      await waitFor(async () => expect(await db.planTasks.get("cross-date-task")).toMatchObject({ scheduledDate: "2026-08-31", startMinutes: undefined, order: 1 }))
      expect(screen.getByText("已移动到目标位置")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "打开任务操作：复习导数" })).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "撤销" }))

      await waitFor(async () => expect(await db.planTasks.get("cross-date-task")).toMatchObject({ scheduledDate: "2026-08-30", startMinutes: undefined, order: 1 }))
      expect(await screen.findByRole("button", { name: "打开任务操作：复习导数" })).toBeInTheDocument()
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("shows the page-level move undo notice when the task view unmounts before the move finishes", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const pendingMove = deferred<PlanTask>()
    const moveSpy = vi.spyOn(planTaskService, "movePlanTask").mockImplementationOnce(() => pendingMove.promise)
    await db.planTasks.add({ id: "pending-move", title: "复习导数", scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 })
    const rendered = renderPlansPage("/plans?view=month&date=2026-08-30", db, new Date(2026, 7, 30, 9, 0))
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")

    try {
      const taskButton = await screen.findByRole("button", { name: "打开任务操作：复习导数" })
      const targetDay = screen.getByRole("button", { name: "2026年8月31日，0 项任务，0 项完成" })
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetDay })

      fireEvent.pointerDown(taskButton, { pointerId: 1, clientX: 20, clientY: 30 })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)) })
      await waitFor(() => expect(screen.getByTestId("task-drag-layer")).toBeInTheDocument())
      fireEvent.pointerUp(taskButton, { pointerId: 1, clientX: 42, clientY: 30 })
      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole("button", { name: "日" }))
      await act(async () => {
        pendingMove.resolve({ id: "pending-move", title: "复习导数", scheduledDate: "2026-08-31", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 2 })
        await pendingMove.promise
      })

      expect(screen.getByText("已移动到目标位置")).toBeInTheDocument()
    } finally {
      moveSpy.mockRestore()
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("keeps the move undo intent visible and retries when restoring the original position fails", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const realMove = planTaskService.movePlanTask
    const moveSpy = vi.spyOn(planTaskService, "movePlanTask")
      .mockImplementationOnce(realMove)
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realMove)
    const originalTask: PlanTask = { id: "retry-move", title: "复习导数", scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
    await db.planTasks.add(originalTask)
    const rendered = renderPlansPage("/plans?view=month&date=2026-08-30", db, new Date(2026, 7, 30, 9, 0))
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")

    try {
      const taskButton = await screen.findByRole("button", { name: "打开任务操作：复习导数" })
      const targetDay = screen.getByRole("button", { name: "2026年8月31日，0 项任务，0 项完成" })
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetDay })

      fireEvent.pointerDown(taskButton, { pointerId: 1, clientX: 20, clientY: 30 })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)) })
      await waitFor(() => expect(screen.getByTestId("task-drag-layer")).toBeInTheDocument())
      fireEvent.pointerUp(taskButton, { pointerId: 1, clientX: 42, clientY: 30 })

      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(1))
      await waitFor(async () => expect(await db.planTasks.get(originalTask.id)).toMatchObject({ scheduledDate: "2026-08-31" }))
      await user.click(screen.getByRole("button", { name: "撤销" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.planTasks.get(originalTask.id)).toMatchObject({ scheduledDate: "2026-08-30", startMinutes: undefined, order: 1 }))
      expect(moveSpy).toHaveBeenCalledTimes(3)
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    } finally {
      moveSpy.mockRestore()
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it.each([
    ["resolves", (pending: ReturnType<typeof deferred<PlanTask>>) => pending.resolve({ id: "retry-race", title: "复习导数", scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 3 })],
    ["fails", (pending: ReturnType<typeof deferred<PlanTask>>) => pending.reject(new Error("旧撤销失败"))],
  ])("does not let a stale move undo that $0 overwrite a newer move undo", async (_outcome, settleStaleUndo) => {
    const db = createDatabase()
    const user = userEvent.setup()
    const realMove = planTaskService.movePlanTask
    const firstMove = deferred<PlanTask>()
    const staleUndo = deferred<PlanTask>()
    const secondMove = deferred<PlanTask>()
    const moveSpy = vi.spyOn(planTaskService, "movePlanTask")
      .mockImplementationOnce(async (...args) => {
        await firstMove.promise
        return realMove(...args)
      })
      .mockImplementationOnce(async (...args) => {
        await staleUndo.promise
        return realMove(...args)
      })
      .mockImplementationOnce(async (...args) => {
        await secondMove.promise
        return realMove(...args)
      })
      .mockImplementation(realMove)
    const originalTask: PlanTask = { id: "retry-race", title: "复习导数", scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
    await db.planTasks.add(originalTask)
    const rendered = renderPlansPage("/plans?view=month&date=2026-08-30", db, new Date(2026, 7, 30, 9, 0))
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint")

    async function dragTo(datePattern: RegExp, pointerId: number) {
      const taskButton = await screen.findByRole("button", { name: "打开任务操作：复习导数" })
      const targetDays = screen.getAllByRole("button", { name: datePattern })
      expect(targetDays).toHaveLength(1)
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetDays[0] })
      fireEvent.pointerDown(taskButton, { pointerId, clientX: 20, clientY: 30 })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)) })
      await waitFor(() => expect(screen.getByTestId("task-drag-layer")).toBeInTheDocument())
      fireEvent.pointerMove(taskButton, { pointerId, clientX: 42, clientY: 30 })
      fireEvent.pointerUp(taskButton, { pointerId, clientX: 42, clientY: 30 })
    }

    try {
      await dragTo(/^2026年8月31日/, 1)
      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(1))
      const firstMoveRequest = moveSpy.mock.results[0]?.value as Promise<PlanTask>
      firstMove.resolve({ id: originalTask.id, title: originalTask.title, scheduledDate: "2026-08-31", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 2 })
      await act(async () => { await firstMoveRequest })
      await waitFor(() => expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument())
      const movedDay = screen.getAllByRole("button", { name: /^2026年8月31日/ })
      expect(movedDay).toHaveLength(1)
      await user.click(movedDay[0])
      await waitFor(() => expect(screen.getByRole("button", { name: "打开任务操作：复习导数" })).toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: "撤销" }))
      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(2))
      await dragTo(/^2026年8月30日/, 2)
      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(3))
      const secondMoveRequest = moveSpy.mock.results[2]?.value as Promise<PlanTask>
      secondMove.resolve({ id: originalTask.id, title: originalTask.title, scheduledDate: "2026-08-30", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 3 })
      await act(async () => { await secondMoveRequest })
      await waitFor(() => expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument())
      await waitFor(async () => expect(await db.planTasks.get(originalTask.id)).toMatchObject({ scheduledDate: "2026-08-30", startMinutes: undefined, order: 1 }))

      await act(async () => {
        settleStaleUndo(staleUndo)
        await staleUndo.promise.catch(() => undefined)
      })
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(await db.planTasks.get(originalTask.id)).toMatchObject({ scheduledDate: "2026-08-30", startMinutes: undefined, order: 1 })
      await user.click(screen.getByRole("button", { name: "撤销" }))
      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(4))
      expect(moveSpy.mock.calls[3]?.[2]).toMatchObject({ scheduledDate: "2026-08-31", startMinutes: undefined, order: 1 })
      await waitFor(async () => expect(await db.planTasks.get(originalTask.id)).toMatchObject({ scheduledDate: "2026-08-31" }))
    } finally {
      moveSpy.mockRestore()
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint)
      else Reflect.deleteProperty(document, "elementFromPoint")
      rendered.unmount()
      vi.useRealTimers()
      await db.delete()
    }
  })

  it("keeps the delete-period dialog open and retries after a failed period deletion", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const targetPeriod = period()
    const realDelete = learningPeriodService.deleteLearningPeriod
    const deleteSpy = vi.spyOn(learningPeriodService, "deleteLearningPeriod")
      .mockRejectedValueOnce(new Error("磁盘写入失败"))
      .mockImplementationOnce(realDelete)
    await db.learningPeriods.add(targetPeriod)
    const rendered = renderPlansPage("/plans?view=period&period=spring&date=2027-03-01", db, new Date(2027, 2, 1, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "更多学期操作" }))
      await user.click(screen.getByRole("menuitem", { name: "删除学期或假期" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "确认删除" }))

      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试")
      await user.click(screen.getByRole("button", { name: "重试" }))

      await waitFor(async () => expect(await db.learningPeriods.get(targetPeriod.id)).toBeUndefined())
      expect(deleteSpy).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    } finally {
      deleteSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })

  it("ignores a completed delete-period request from a closed session", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const firstDelete = deferred<{ affectedTaskCount: number }>()
    const deleteSpy = vi.spyOn(learningPeriodService, "deleteLearningPeriod")
      .mockImplementationOnce(() => firstDelete.promise)
    await db.learningPeriods.bulkAdd([
      period({ id: "spring", name: "春季学期", startDate: "2027-02-22", endDate: "2027-06-30" }),
      period({ id: "summer", kind: "summer-break", name: "暑假", startDate: "2027-07-01", endDate: "2027-08-31" }),
    ])
    const rendered = renderPlansPage("/plans?view=period&period=spring&date=2027-03-01", db, new Date(2027, 2, 1, 9, 0))

    try {
      await user.click(await screen.findByRole("button", { name: "更多学期操作" }))
      await user.click(screen.getByRole("menuitem", { name: "删除学期或假期" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "确认删除" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "取消" }))
      await user.click(screen.getByRole("button", { name: /暑假.*2027-07-01/ }))
      await user.click(screen.getByRole("button", { name: "更多学期操作" }))
      await user.click(screen.getByRole("menuitem", { name: "删除学期或假期" }))

      await act(async () => {
        firstDelete.resolve({ affectedTaskCount: 0 })
        await firstDelete.promise
      })

      expect(screen.getByRole("dialog", { name: "删除“暑假”？" })).toBeInTheDocument()
      expect(deleteSpy).toHaveBeenCalledTimes(1)
    } finally {
      deleteSpy.mockRestore()
      rendered.unmount()
      await db.delete()
    }
  })
})
