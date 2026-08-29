import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"
import { usePlanWorkspace, type PlanView } from "./usePlanWorkspace"

function createDatabase() {
  return new VeloDB(`velo-plan-workspace-${crypto.randomUUID()}`)
}

function task(id: string, scheduledDate: string, isCompleted: 0 | 1 = 0): PlanTask {
  return {
    id,
    title: `Task ${id}`,
    scheduledDate,
    isCompleted,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

const period: LearningPeriod = {
  id: "autumn-opening",
  kind: "semester",
  name: "秋季开学段",
  startDate: "2026-08-30",
  endDate: "2026-09-02",
  createdAt: 1,
  updatedAt: 1,
}

const laterPeriod: LearningPeriod = {
  id: "autumn-review",
  kind: "custom-break",
  name: "秋季复习段",
  startDate: "2026-09-10",
  endDate: "2026-09-12",
  createdAt: 2,
  updatedAt: 2,
}

async function seedWorkspace(db: VeloDB) {
  await db.learningPeriods.add(period)
  await db.planTasks.bulkAdd([
    task("week-start", "2026-08-24", 1),
    task("selected-day", "2026-08-30"),
    task("next-week", "2026-08-31", 1),
    task("period-end", "2026-09-02"),
    task("after-period", "2026-09-03"),
  ])
}

function renderWorkspace(db: VeloDB, view: PlanView, periodId?: string) {
  return renderHook(() =>
    usePlanWorkspace({
      db,
      view,
      selectedDate: "2026-08-30",
      periodId,
    }),
  )
}

describe("usePlanWorkspace", () => {
  it.each([
    ["day", undefined, ["selected-day"]],
    ["week", undefined, ["week-start", "selected-day"]],
    ["month", undefined, ["week-start", "selected-day", "next-week"]],
    ["period", period.id, ["selected-day", "next-week", "period-end"]],
  ] satisfies Array<[PlanView, string | undefined, string[]]>) (
    "queries the inclusive %s range",
    async (view, periodId, expectedIds) => {
      const db = createDatabase()
      await seedWorkspace(db)
      const rendered = renderWorkspace(db, view, periodId)

      try {
        await waitFor(() => {
          expect(rendered.result.current?.tasks.map(({ id }) => id)).toEqual(expectedIds)
        })
      } finally {
        rendered.unmount()
        await db.delete()
      }
    },
  )

  it("keeps periods and progress live without copying database rows into page state", async () => {
    const db = createDatabase()
    await seedWorkspace(db)
    const rendered = renderWorkspace(db, "period", period.id)

    try {
      await waitFor(() => {
        expect(rendered.result.current).toMatchObject({
          periods: [period],
          selectedPeriod: period,
          progress: { completed: 1, total: 3, ratio: 1 / 3 },
        })
      })

      await db.learningPeriods.add(laterPeriod)

      await waitFor(() => {
        expect(rendered.result.current?.periods).toEqual([period, laterPeriod])
      })

      await db.planTasks.update("selected-day", { isCompleted: 1, completedAt: 2, updatedAt: 2 })

      await waitFor(() => {
        expect(rendered.result.current?.progress).toEqual({ completed: 2, total: 3, ratio: 2 / 3 })
      })
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("returns an empty zero progress snapshot when a period is not selected", async () => {
    const db = createDatabase()
    const rendered = renderWorkspace(db, "period")

    try {
      await waitFor(() => {
        expect(rendered.result.current).toMatchObject({
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

  it("returns one winter-break task from the same source in day, week, month, and period queries", async () => {
    const db = createDatabase()
    const winterBreak: LearningPeriod = {
      id: "winter-break",
      kind: "winter-break",
      name: "寒假",
      startDate: "2027-01-17",
      endDate: "2027-02-21",
      createdAt: 1,
      updatedAt: 1,
    }
    await db.learningPeriods.add(winterBreak)
    await db.planTasks.add(task("winter-holiday", "2027-02-21"))
    const renders = (["day", "week", "month", "period"] as PlanView[]).map((view) => renderHook(() => usePlanWorkspace({
      db,
      view,
      selectedDate: "2027-02-21",
      periodId: view === "period" ? winterBreak.id : undefined,
    })))

    try {
      await Promise.all(renders.map((rendered) => waitFor(() => {
        expect(rendered.result.current?.tasks.map((row) => row.id)).toEqual(["winter-holiday"])
      })))
    } finally {
      renders.forEach((rendered) => rendered.unmount())
      await db.delete()
    }
  })
})
