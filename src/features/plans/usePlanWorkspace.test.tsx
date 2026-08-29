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

async function seedWorkspace(db: VeloDB) {
  await db.learningPeriods.add(period)
  await db.planTasks.bulkAdd([
    task("week-start", "2026-08-24", 1),
    task("selected-day", "2026-08-30"),
    task("next-week", "2026-08-31", 1),
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
    ["period", period.id, ["selected-day", "next-week"]],
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
          progress: { completed: 1, total: 2, ratio: 0.5 },
        })
      })

      await db.planTasks.update("selected-day", { isCompleted: 1, completedAt: 2, updatedAt: 2 })

      await waitFor(() => {
        expect(rendered.result.current?.progress).toEqual({ completed: 2, total: 2, ratio: 1 })
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
})
