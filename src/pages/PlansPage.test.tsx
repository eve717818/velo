import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import type { LearningPeriod } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import * as learningPeriodService from "@/features/plans/data/learning-period-service"
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
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe("PlansPage", () => {
  it("switches among all plan views while keeping the selected date in the URL", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-28", db)

    try {
      expect(await screen.findByText("0 / 0")).toBeInTheDocument()
      for (const label of ["日", "周", "月", "周期"]) {
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

  it("exposes the current shell task lane as an untimed date drop zone", async () => {
    const db = createDatabase()
    await db.planTasks.add({
      id: "drop-zone-task",
      title: "复习导数",
      scheduledDate: "2026-08-29",
      isCompleted: 0,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-29", db)

    try {
      expect(await screen.findByText("复习导数")).toBeInTheDocument()
      expect(screen.getByTestId("current-plan-drop-zone")).toHaveAttribute("data-drop-date", "2026-08-29")
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
      await user.click(await screen.findByRole("button", { name: "新建周期" }))
      expect(screen.getByRole("dialog", { name: "新建学习周期" })).toBeInTheDocument()
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
    } finally {
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
      await user.click(await screen.findByRole("button", { name: "删除周期" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "删除周期" }))

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
      await user.click(await screen.findByRole("button", { name: "删除周期" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "删除周期" }))
      await user.click(within(screen.getByRole("dialog", { name: "删除“春季学期”？" })).getByRole("button", { name: "取消" }))
      await user.click(screen.getByRole("button", { name: /暑假.*2027-07-01/ }))
      await user.click(screen.getByRole("button", { name: "删除周期" }))

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
