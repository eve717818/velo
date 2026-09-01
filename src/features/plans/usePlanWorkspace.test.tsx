import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import { usePlanWorkspace, type PlanView } from "./usePlanWorkspace"

function createDatabase() {
  return new VeloDB(`velo-plan-workspace-${crypto.randomUUID()}`)
}

function task(overrides: Pick<PlanTask, "id" | "scope" | "periodKey"> & Partial<PlanTask>): PlanTask {
  return {
    title: `Task ${overrides.id}`,
    isCompleted: 0,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const fall: LearningPeriod = {
  id: "fall",
  kind: "semester",
  name: "秋季学期",
  startDate: "2026-09-01",
  endDate: "2027-01-31",
  createdAt: 1,
  updatedAt: 1,
}

function renderWorkspace(db: VeloDB, view: PlanView, periodId?: string) {
  return renderHook(() => usePlanWorkspace({
    db,
    view,
    selectedDate: "2026-09-01",
    periodId,
  }))
}

describe("usePlanWorkspace", () => {
  it.each([
    ["day", undefined, "day"],
    ["week", undefined, "week"],
    ["month", undefined, "month"],
    ["period", fall.id, "semester"],
  ] satisfies Array<[PlanView, string | undefined, string]>)(
    "returns only the active %s workspace",
    async (view, periodId, expectedId) => {
      const db = createDatabase()
      await db.learningPeriods.add(fall)
      await db.planTasks.bulkAdd([
        task({ id: "day", scope: "day", periodKey: "2026-09-01" }),
        task({ id: "week", scope: "week", periodKey: "2026-08-31" }),
        task({ id: "month", scope: "month", periodKey: "2026-09" }),
        task({ id: "semester", scope: "semester", periodKey: "fall" }),
      ])
      const rendered = renderWorkspace(db, view, periodId)

      try {
        await waitFor(() => {
          expect(rendered.result.current).toMatchObject({
            scope: view === "period" ? "semester" : view,
            tasks: [expect.objectContaining({ id: expectedId })],
            progress: { completed: 0, total: 1, ratio: 0 },
          })
        })
      } finally {
        rendered.unmount()
        await db.delete()
      }
    },
  )

  it("sorts day tasks by time before order and other scopes by order", async () => {
    const db = createDatabase()
    await db.planTasks.bulkAdd([
      task({ id: "day-untimed", scope: "day", periodKey: "2026-09-01", order: 1 }),
      task({ id: "day-late", scope: "day", periodKey: "2026-09-01", startMinutes: 600, order: 2 }),
      task({ id: "day-early", scope: "day", periodKey: "2026-09-01", startMinutes: 480, order: 3 }),
      task({ id: "week-second", scope: "week", periodKey: "2026-08-31", order: 2 }),
      task({ id: "week-first", scope: "week", periodKey: "2026-08-31", order: 1 }),
    ])
    const day = renderWorkspace(db, "day")
    const week = renderWorkspace(db, "week")

    try {
      await waitFor(() => {
        expect(day.result.current?.tasks.map(({ id }) => id)).toEqual(["day-early", "day-late", "day-untimed"])
        expect(week.result.current?.tasks.map(({ id }) => id)).toEqual(["week-first", "week-second"])
      })
    } finally {
      day.unmount()
      week.unmount()
      await db.delete()
    }
  })

  it("returns no semester tasks until a period is selected", async () => {
    const db = createDatabase()
    const rendered = renderWorkspace(db, "period")

    try {
      await waitFor(() => {
        expect(rendered.result.current).toMatchObject({
          scope: "semester",
          periodKey: null,
          tasks: [],
          selectedPeriod: null,
          progress: { completed: 0, total: 0, ratio: 0 },
        })
      })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
