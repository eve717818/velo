import { describe, expect, it } from "vitest"

import type { LearningPeriod, PlanTask } from "@/db/types"
import { VeloDB } from "@/db/velo-db"

import {
  copyTasksToPeriod,
  copyTasksToPeriodAndDismiss,
  createPlanTask,
  deletePlanTask,
  movePlanTask,
  setTaskCompletion,
  updatePlanTask,
} from "./plan-task-service"

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-task-test-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: crypto.randomUUID(),
    title: "任务",
    scope: "day",
    periodKey: "2026-08-31",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "winter-break",
    kind: "winter-break",
    name: "2027 寒假",
    startDate: "2027-01-17",
    endDate: "2027-02-21",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("plan task service", () => {
  it("creates, updates, completes, moves, and deletes a task within one scope", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTask(
        db,
        {
          scope: "week",
          periodKey: "2026-08-31",
          title: " 完成线代复习 ",
          estimatedMinutes: 90,
          subject: " 数学 ",
          notes: " 做完错题 ",
        },
        100,
      )

      expect(created).toMatchObject({
        scope: "week",
        periodKey: "2026-08-31",
        title: "完成线代复习",
        subject: "数学",
        notes: "做完错题",
        estimatedMinutes: 90,
        startMinutes: undefined,
        isCompleted: 0,
        completedAt: undefined,
        order: 1,
        createdAt: 100,
        updatedAt: 100,
      })
      expect(await db.planTasks.get(created.id)).toEqual(created)

      const updated = await updatePlanTask(
        db,
        created.id,
        {
          scope: "week",
          periodKey: "2026-08-31",
          title: " 完成线代复习与总结 ",
          estimatedMinutes: 120,
        },
        101,
      )
      expect(updated).toMatchObject({
        id: created.id,
        scope: "week",
        periodKey: "2026-08-31",
        title: "完成线代复习与总结",
        estimatedMinutes: 120,
        startMinutes: undefined,
        order: 1,
        createdAt: 100,
        updatedAt: 101,
      })

      await setTaskCompletion(db, created.id, true, 102)
      expect(await db.planTasks.get(created.id)).toMatchObject({ isCompleted: 1, completedAt: 102, updatedAt: 102 })

      await setTaskCompletion(db, created.id, false, 103)
      expect(await db.planTasks.get(created.id)).toMatchObject({ isCompleted: 0, completedAt: undefined, updatedAt: 103 })

      await movePlanTask(db, created.id, { scope: "week", periodKey: "2026-09-07" }, 104)
      expect(await db.planTasks.get(created.id)).toMatchObject({
        scope: "week",
        periodKey: "2026-09-07",
        startMinutes: undefined,
        order: 1,
        updatedAt: 104,
      })

      await expect(deletePlanTask(db, created.id)).resolves.toBe(true)
      expect(await db.planTasks.get(created.id)).toBeUndefined()
      await expect(deletePlanTask(db, created.id)).resolves.toBe(false)
    })
  })

  it("validates scoped period keys, times, estimates, and scope ownership before mutating", async () => {
    await withDatabase(async (db) => {
      await expect(createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "  " }, 10)).rejects.toThrow("任务名称不能为空")
      await expect(createPlanTask(db, { scope: "day", periodKey: "2026-02-30", title: "无效日期" }, 11)).rejects.toThrow("日计划周期无效")
      await expect(createPlanTask(db, { scope: "week", periodKey: "2026-09-01", title: "无效周" }, 12)).rejects.toThrow("周计划周期无效")
      await expect(createPlanTask(db, { scope: "month", periodKey: "2026-13", title: "无效月" }, 13)).rejects.toThrow("月计划周期无效")
      await expect(createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "无效时间", startMinutes: -1 }, 14)).rejects.toThrow("开始时间必须在 0 到 1439 分钟之间")
      await expect(createPlanTask(db, { scope: "month", periodKey: "2026-09", title: "不允许时间", startMinutes: 540 }, 15)).rejects.toThrow("只有日计划任务可以设置时间")
      await expect(createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "无效时长", estimatedMinutes: 0 }, 16)).rejects.toThrow("预计时长必须大于 0")
      await expect(createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "小数时长", estimatedMinutes: 12.5 }, 17)).rejects.toThrow("预计时长必须是正整数")

      const created = await createPlanTask(db, { scope: "week", periodKey: "2026-08-31", title: "已有任务" }, 18)
      await expect(updatePlanTask(db, created.id, { scope: "month", periodKey: "2026-09", title: created.title }, 19)).rejects.toThrow("不能跨计划层级移动任务")
      await expect(movePlanTask(db, created.id, { scope: "month", periodKey: "2026-09" }, 20)).rejects.toThrow("不能跨计划层级移动任务")
      await expect(updatePlanTask(db, created.id, { scope: "week", periodKey: "2026-08-31", title: created.title, startMinutes: 540 }, 21)).rejects.toThrow("只有日计划任务可以设置时间")
      await expect(movePlanTask(db, created.id, { scope: "week", periodKey: "2026-08-31", startMinutes: 540 }, 22)).rejects.toThrow("只有日计划任务可以设置时间")
      await expect(movePlanTask(db, created.id, { scope: "week", periodKey: "2026-08-31", order: 1.5 }, 23)).rejects.toThrow("任务排序必须是非负整数")

      expect(await db.planTasks.get(created.id)).toEqual(created)
      expect(await db.planTasks.count()).toBe(1)
    })
  })

  it("requires a stored learning period for every semester create, update, and move", async () => {
    await withDatabase(async (db) => {
      await expect(createPlanTask(db, { scope: "semester", periodKey: "missing-period", title: "不存在的学期" }, 30)).rejects.toThrow("请选择有效的学期或假期")

      const firstPeriod = period({ id: "semester-1", kind: "semester", name: "大一上" })
      const secondPeriod = period({ id: "semester-2", kind: "semester", name: "大一下" })
      await db.learningPeriods.bulkAdd([firstPeriod, secondPeriod])
      const created = await createPlanTask(db, { scope: "semester", periodKey: firstPeriod.id, title: "长期任务" }, 31)
      expect(created).toMatchObject({ scope: "semester", periodKey: firstPeriod.id, startMinutes: undefined })

      await db.learningPeriods.delete(firstPeriod.id)
      await expect(updatePlanTask(db, created.id, { scope: "semester", periodKey: firstPeriod.id, title: "仍是长期任务" }, 32)).rejects.toThrow("请选择有效的学期或假期")
      await expect(movePlanTask(db, created.id, { scope: "semester", periodKey: "missing-period" }, 33)).rejects.toThrow("请选择有效的学期或假期")

      const moved = await movePlanTask(db, created.id, { scope: "semester", periodKey: secondPeriod.id }, 34)
      expect(moved).toMatchObject({ scope: "semester", periodKey: secondPeriod.id, startMinutes: undefined, order: 1 })
    })
  })

  it("isolates order by scope and period key while preserving day lanes", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "day-untimed-1", scope: "day", periodKey: "2026-08-31", order: 1 }),
        task({ id: "day-untimed-2", scope: "day", periodKey: "2026-08-31", order: 2 }),
        task({ id: "day-timed-1", scope: "day", periodKey: "2026-08-31", startMinutes: 540, order: 1 }),
        task({ id: "day-timed-2", scope: "day", periodKey: "2026-08-31", startMinutes: 600, order: 2 }),
        task({ id: "week-1", scope: "week", periodKey: "2026-08-31", order: 1 }),
      ])

      const dayUntimed = await createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "新日未定时任务" }, 40)
      const dayTimed = await createPlanTask(db, { scope: "day", periodKey: "2026-08-31", title: "新日定时任务", startMinutes: 660 }, 41)
      const week = await createPlanTask(db, { scope: "week", periodKey: "2026-08-31", title: "新周任务" }, 42)

      expect(dayUntimed.order).toBe(3)
      expect(dayTimed.order).toBe(3)
      expect(week.order).toBe(2)

      const movedToTimed = await movePlanTask(db, "day-untimed-1", { scope: "day", periodKey: "2026-08-31", startMinutes: 720 }, 43)
      expect(movedToTimed).toMatchObject({ scope: "day", periodKey: "2026-08-31", startMinutes: 720, order: 4 })
    })
  })

  it("reassigns order only when the scoped location or day lane changes", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "same-lane-1", periodKey: "2026-08-31", order: 1 }),
        task({ id: "same-lane-2", periodKey: "2026-08-31", order: 2 }),
        task({ id: "next-day-1", periodKey: "2026-09-01", order: 1 }),
        task({ id: "timed-1", periodKey: "2026-09-01", startMinutes: 480, order: 1 }),
        task({ id: "timed-2", periodKey: "2026-09-01", startMinutes: 540, order: 2 }),
        task({ id: "untimed-target", periodKey: "2026-09-01", order: 2 }),
      ])

      const unchanged = await updatePlanTask(db, "same-lane-2", { scope: "day", periodKey: "2026-08-31", title: "保留排序" }, 50)
      expect(unchanged.order).toBe(2)

      const changedDate = await updatePlanTask(db, "same-lane-1", { scope: "day", periodKey: "2026-09-01", title: "切到下一天" }, 51)
      expect(changedDate).toMatchObject({ periodKey: "2026-09-01", startMinutes: undefined, order: 3 })

      const toTimed = await updatePlanTask(db, "untimed-target", { scope: "day", periodKey: "2026-09-01", title: "改为定时", startMinutes: 600 }, 52)
      expect(toTimed).toMatchObject({ periodKey: "2026-09-01", startMinutes: 600, order: 3 })

      const toUntimed = await updatePlanTask(db, "timed-1", { scope: "day", periodKey: "2026-09-01", title: "改为未定时" }, 53)
      expect(toUntimed).toMatchObject({ periodKey: "2026-09-01", startMinutes: undefined, order: 4 })
    })
  })

  it("rejects an undo based on an outdated scoped position", async () => {
    await withDatabase(async (db) => {
      const current = task({ id: "stale-position", periodKey: "2026-08-31", startMinutes: 480, order: 2 })
      await db.planTasks.add(current)

      const movedA = await movePlanTask(db, current.id, { scope: "day", periodKey: "2026-09-01", startMinutes: 600, order: 3 }, 60)
      const movedB = await movePlanTask(db, current.id, { scope: "day", periodKey: "2026-09-02", startMinutes: 720, order: 4 }, 61)

      await expect(movePlanTask(db, current.id, {
        scope: current.scope,
        periodKey: current.periodKey,
        startMinutes: current.startMinutes,
        order: current.order,
        expectedPosition: {
          scope: movedA.scope,
          periodKey: movedA.periodKey,
          startMinutes: movedA.startMinutes,
          order: movedA.order,
        },
      }, 62)).rejects.toThrow("任务位置已变化")

      expect(await db.planTasks.get(current.id)).toMatchObject({
        scope: movedB.scope,
        periodKey: movedB.periodKey,
        startMinutes: movedB.startMinutes,
        order: movedB.order,
        updatedAt: 61,
      })
    })
  })

  it("copies independent incomplete tasks into the target semester", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "source-1", title: "英语阅读", periodKey: "2027-01-10", subject: "英语", estimatedMinutes: 30, notes: "精读第一篇", startMinutes: 480, isCompleted: 1, completedAt: 50, order: 1 }),
        task({ id: "source-2", title: "数学整理", periodKey: "2027-01-11", subject: "数学", estimatedMinutes: 45, notes: "错题回顾", order: 2 }),
        task({ id: "target-existing", scope: "semester", periodKey: "winter-break", title: "既有长期任务", order: 2 }),
      ])

      const copiedIds = await copyTasksToPeriod(db, ["source-1", "source-2"], period(), "2027-01-20", 100)
      expect(copiedIds).toHaveLength(2)
      expect(copiedIds).not.toContain("source-1")
      expect(copiedIds).not.toContain("source-2")
      expect(await db.planTasks.bulkGet(copiedIds)).toEqual([
        expect.objectContaining({
          scope: "semester",
          periodKey: "winter-break",
          title: "英语阅读",
          subject: "英语",
          estimatedMinutes: 30,
          notes: "精读第一篇",
          startMinutes: undefined,
          isCompleted: 0,
          completedAt: undefined,
          order: 3,
          createdAt: 100,
          updatedAt: 100,
        }),
        expect.objectContaining({
          scope: "semester",
          periodKey: "winter-break",
          title: "数学整理",
          startMinutes: undefined,
          isCompleted: 0,
          completedAt: undefined,
          order: 4,
          createdAt: 100,
          updatedAt: 100,
        }),
      ])
      expect(await db.planTasks.get("source-1")).toMatchObject({ scope: "day", periodKey: "2027-01-10", startMinutes: 480, isCompleted: 1, completedAt: 50 })
    })
  })

  it("rejects copying tasks into a historical target period", async () => {
    await withDatabase(async (db) => {
      const historicalTarget = period({ id: "historical-target", endDate: "2027-01-16" })
      await db.planTasks.add(task({ id: "historical-source", periodKey: "2027-01-10" }))

      await expect(copyTasksToPeriod(db, ["historical-source"], historicalTarget, "2027-02-01", 300)).rejects.toThrow("不能复制到已结束的学习周期")
      expect(await db.planTasks.count()).toBe(1)
    })
  })

  it("commits copied tasks and migration dismissal as one transaction", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.add(task({ id: "atomic-source", periodKey: "2027-01-10" }))
      const target = period()

      await copyTasksToPeriodAndDismiss(db, ["atomic-source"], target, "source", "2027-01-18", 301)
      expect(await db.appMeta.get("periodMigrationDismissed:source:winter-break")).toMatchObject({ value: "1" })
      expect(await db.planTasks.count()).toBe(2)

      await db.appMeta.delete("periodMigrationDismissed:source:winter-break")
      db.appMeta.hook("creating", () => { throw new Error("forced dismissal error") })
      await expect(copyTasksToPeriodAndDismiss(db, ["atomic-source"], target, "source", "2027-01-18", 302)).rejects.toThrow("forced dismissal error")
      expect(await db.appMeta.get("periodMigrationDismissed:source:winter-break")).toBeUndefined()
      expect(await db.planTasks.count()).toBe(2)
    })
  })

  it("rolls back all copied tasks when one write fails", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "source-1", title: "英语阅读", periodKey: "2027-01-10", order: 1 }),
        task({ id: "source-2", title: "数学整理", periodKey: "2027-01-11", order: 2 }),
      ])

      let writes = 0
      db.planTasks.hook("creating", () => {
        writes += 1
        if (writes === 2) throw new Error("forced write error")
      })

      await expect(copyTasksToPeriod(db, ["source-1", "source-2"], period(), "2027-01-10", 200)).rejects.toThrow("forced write error")
      expect((await db.planTasks.toArray()).map((item) => item.id).sort()).toEqual(["source-1", "source-2"])
    })
  })
})
