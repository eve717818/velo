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
    scheduledDate: "2026-08-28",
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
  it("creates, updates, completes, moves, and deletes tasks", async () => {
    await withDatabase(async (db) => {
      const now = 100

      await expect(
        createPlanTask(
          db,
          {
            title: "  ",
            scheduledDate: "2026-08-28",
          },
          now,
        ),
      ).rejects.toThrow("任务名称不能为空")

      const created = await createPlanTask(
        db,
        {
          title: " 复习导数 ",
          scheduledDate: "2026-08-28",
          estimatedMinutes: 45,
          subject: "数学",
          notes: " 先做例题 ",
        },
        now,
      )

      expect(created).toMatchObject({
        title: "复习导数",
        scheduledDate: "2026-08-28",
        subject: "数学",
        estimatedMinutes: 45,
        notes: "先做例题",
        isCompleted: 0,
        completedAt: undefined,
        order: 1,
        createdAt: now,
        updatedAt: now,
      })
      expect(await db.planTasks.get(created.id)).toEqual(created)

      const updated = await updatePlanTask(
        db,
        created.id,
        {
          title: " 复习导数与极限 ",
          scheduledDate: "2026-08-28",
          startMinutes: 540,
          estimatedMinutes: 60,
          subject: "高数",
          notes: " 第二轮 ",
        },
        now + 1,
      )

      expect(updated).toMatchObject({
        id: created.id,
        title: "复习导数与极限",
        scheduledDate: "2026-08-28",
        startMinutes: 540,
        estimatedMinutes: 60,
        subject: "高数",
        notes: "第二轮",
        createdAt: now,
        updatedAt: now + 1,
      })

      await setTaskCompletion(db, created.id, true, now + 2)
      expect(await db.planTasks.get(created.id)).toMatchObject({
        isCompleted: 1,
        completedAt: now + 2,
        updatedAt: now + 2,
      })

      await setTaskCompletion(db, created.id, false, now + 3)
      expect(await db.planTasks.get(created.id)).toMatchObject({
        isCompleted: 0,
        completedAt: undefined,
        updatedAt: now + 3,
      })

      await movePlanTask(
        db,
        created.id,
        {
          scheduledDate: "2026-08-29",
          startMinutes: undefined,
        },
        now + 4,
      )

      expect(await db.planTasks.get(created.id)).toMatchObject({
        scheduledDate: "2026-08-29",
        startMinutes: undefined,
        order: 1,
        updatedAt: now + 4,
      })

      await expect(deletePlanTask(db, created.id)).resolves.toBe(true)
      expect(await db.planTasks.get(created.id)).toBeUndefined()
      await expect(deletePlanTask(db, created.id)).resolves.toBe(false)
    })
  })

  it("validates dates, start times, and estimates before mutating", async () => {
    await withDatabase(async (db) => {
      await expect(
        createPlanTask(
          db,
          {
            title: "无效日期",
            scheduledDate: "2026-02-30",
          },
          10,
        ),
      ).rejects.toThrow("任务日期无效")

      await expect(
        createPlanTask(
          db,
          {
            title: "无效时间",
            scheduledDate: "2026-08-28",
            startMinutes: -1,
          },
          11,
        ),
      ).rejects.toThrow("开始时间必须在 0 到 1439 分钟之间")

      await expect(
        createPlanTask(
          db,
          {
            title: "无效时长",
            scheduledDate: "2026-08-28",
            estimatedMinutes: 0,
          },
          12,
        ),
      ).rejects.toThrow("预计时长必须大于 0")

      await expect(
        createPlanTask(
          db,
          {
            title: "小数时长",
            scheduledDate: "2026-08-28",
            estimatedMinutes: 12.5,
          },
          12,
        ),
      ).rejects.toThrow("预计时长必须是正整数")
      expect((await db.planTasks.toArray()).some((task) => task.title === "小数时长")).toBe(false)

      const existing = await createPlanTask(
        db,
        {
          title: "已有任务",
          scheduledDate: "2026-08-28",
        },
        13,
      )

      await expect(
        updatePlanTask(
          db,
          existing.id,
          {
            title: "已有任务",
            scheduledDate: "2026-08-32",
          },
          14,
        ),
      ).rejects.toThrow("任务日期无效")

      await expect(
        movePlanTask(
          db,
          existing.id,
          {
            scheduledDate: "2026-08-28",
            startMinutes: 1440,
          },
          15,
        ),
      ).rejects.toThrow("开始时间必须在 0 到 1439 分钟之间")

      await expect(
        movePlanTask(
          db,
          existing.id,
          {
            scheduledDate: "2026-08-28",
            order: 1.5,
          },
          16,
        ),
      ).rejects.toThrow("任务排序必须是非负整数")

      await expect(
        movePlanTask(
          db,
          existing.id,
          {
            scheduledDate: "2026-08-28",
            order: -1,
          },
          17,
        ),
      ).rejects.toThrow("任务排序必须是非负整数")
    })
  })

  it("assigns order within each date and timed lane", async () => {
      await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "untimed-1", scheduledDate: "2026-08-28", order: 1 }),
        task({ id: "untimed-2", scheduledDate: "2026-08-28", order: 2 }),
        task({ id: "timed-1", scheduledDate: "2026-08-28", startMinutes: 540, order: 1 }),
        task({ id: "timed-2", scheduledDate: "2026-08-28", startMinutes: 600, order: 2 }),
      ])

      const untimed = await createPlanTask(
        db,
        {
          title: "新未定时任务",
          scheduledDate: "2026-08-28",
        },
        20,
      )

      const timed = await createPlanTask(
        db,
        {
          title: "新定时任务",
          scheduledDate: "2026-08-28",
          startMinutes: 660,
        },
        21,
      )

      expect(untimed.order).toBe(3)
      expect(timed.order).toBe(3)

      await movePlanTask(
        db,
        "untimed-1",
        {
          scheduledDate: "2026-08-28",
          startMinutes: 720,
        },
        22,
      )

      expect(await db.planTasks.get("untimed-1")).toMatchObject({
        scheduledDate: "2026-08-28",
        startMinutes: 720,
        order: 4,
      })
    })
  })

  it("reassigns order on update when the date or timed lane changes", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "same-lane-1", scheduledDate: "2026-08-28", order: 1 }),
        task({ id: "same-lane-2", scheduledDate: "2026-08-28", order: 2 }),
        task({ id: "next-day-1", scheduledDate: "2026-08-29", order: 1 }),
        task({ id: "timed-1", scheduledDate: "2026-08-29", startMinutes: 480, order: 1 }),
        task({ id: "timed-2", scheduledDate: "2026-08-29", startMinutes: 540, order: 2 }),
        task({ id: "untimed-target", scheduledDate: "2026-08-29", order: 2 }),
      ])

      const unchangedLane = await updatePlanTask(
        db,
        "same-lane-2",
        {
          title: "保留排序",
          scheduledDate: "2026-08-28",
        },
        30,
      )

      expect(unchangedLane.order).toBe(2)

      const changedDate = await updatePlanTask(
        db,
        "same-lane-1",
        {
          title: "切到下一天",
          scheduledDate: "2026-08-29",
        },
        31,
      )

      expect(changedDate).toMatchObject({
        scheduledDate: "2026-08-29",
        startMinutes: undefined,
        order: 3,
      })

      const toTimed = await updatePlanTask(
        db,
        "untimed-target",
        {
          title: "改为定时",
          scheduledDate: "2026-08-29",
          startMinutes: 600,
        },
        32,
      )

      expect(toTimed).toMatchObject({
        scheduledDate: "2026-08-29",
        startMinutes: 600,
        order: 3,
      })

      const toUntimed = await updatePlanTask(
        db,
        "timed-1",
        {
          title: "改为未定时",
          scheduledDate: "2026-08-29",
        },
        33,
      )

      expect(toUntimed).toMatchObject({
        scheduledDate: "2026-08-29",
        startMinutes: undefined,
        order: 4,
      })
    })
  })

  it("rejects an undo based on an outdated position without overwriting a newer move", async () => {
    await withDatabase(async (db) => {
      const current = task({ id: "stale-position", scheduledDate: "2026-08-28", startMinutes: 480, order: 2 })
      await db.planTasks.add(current)

      const movedA = await movePlanTask(
        db,
        current.id,
        { scheduledDate: "2026-08-29", startMinutes: 600, order: 3 },
        40,
      )
      const movedB = await movePlanTask(
        db,
        current.id,
        { scheduledDate: "2026-08-30", startMinutes: 720, order: 4 },
        41,
      )

      await expect(
        movePlanTask(
          db,
          current.id,
          { scheduledDate: current.scheduledDate, startMinutes: current.startMinutes, order: current.order, expectedPosition: { scheduledDate: movedA.scheduledDate, startMinutes: movedA.startMinutes, order: movedA.order } },
          42,
        ),
      ).rejects.toThrow("任务位置已变化")
      expect(await db.planTasks.get(current.id)).toMatchObject({
        scheduledDate: movedB.scheduledDate,
        startMinutes: movedB.startMinutes,
        order: movedB.order,
        updatedAt: 41,
      })
    })
  })

  it("copies tasks into the target period using start date outside the range and today inside the range", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({
          id: "source-1",
          title: "英语阅读",
          scheduledDate: "2027-01-10",
          subject: "英语",
          estimatedMinutes: 30,
          notes: "精读第一篇",
          startMinutes: 480,
          isCompleted: 1,
          completedAt: 50,
          order: 1,
        }),
        task({
          id: "source-2",
          title: "数学整理",
          scheduledDate: "2027-01-11",
          subject: "数学",
          estimatedMinutes: 45,
          notes: "错题回顾",
          order: 2,
        }),
      ])

      const target = period()

      const beforeStartIds = await copyTasksToPeriod(db, ["source-1", "source-2"], target, "2027-01-10", 100)
      expect(beforeStartIds).toHaveLength(2)

      expect(await db.planTasks.bulkGet(beforeStartIds)).toEqual([
        expect.objectContaining({
          title: "英语阅读",
          scheduledDate: "2027-01-17",
          subject: "英语",
          estimatedMinutes: 30,
          notes: "精读第一篇",
          startMinutes: undefined,
          isCompleted: 0,
          completedAt: undefined,
          createdAt: 100,
          updatedAt: 100,
        }),
        expect.objectContaining({
          title: "数学整理",
          scheduledDate: "2027-01-17",
          subject: "数学",
          estimatedMinutes: 45,
          notes: "错题回顾",
          startMinutes: undefined,
          isCompleted: 0,
          completedAt: undefined,
          createdAt: 100,
          updatedAt: 100,
        }),
      ])

      const insideIds = await copyTasksToPeriod(db, ["source-1"], target, "2027-01-20", 101)
      expect(await db.planTasks.get(insideIds[0])).toMatchObject({
        title: "英语阅读",
        scheduledDate: "2027-01-20",
        startMinutes: undefined,
        isCompleted: 0,
        completedAt: undefined,
        createdAt: 101,
        updatedAt: 101,
      })

      expect(await db.planTasks.get("source-1")).toMatchObject({
        scheduledDate: "2027-01-10",
        startMinutes: 480,
        isCompleted: 1,
        completedAt: 50,
      })
      expect(await db.planTasks.get("source-2")).toMatchObject({
        scheduledDate: "2027-01-11",
        isCompleted: 0,
      })
    })
  })

  it("rejects copying tasks into a historical target period", async () => {
    await withDatabase(async (db) => {
      const historicalTarget: LearningPeriod = { ...period(), id: "historical-target", endDate: "2027-01-16" }
      await db.planTasks.add(task({ id: "historical-source", scheduledDate: "2027-01-10" }))

      await expect(copyTasksToPeriod(db, ["historical-source"], historicalTarget, "2027-02-01", 300)).rejects.toThrow("不能复制到已结束的学习周期")
      expect(await db.planTasks.count()).toBe(1)
    })
  })

  it("commits copied tasks and migration dismissal as one transaction", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.add(task({ id: "atomic-source", scheduledDate: "2027-01-10" }))
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

  it("rolls back copied tasks when a write fails", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.bulkAdd([
        task({ id: "source-1", title: "英语阅读", scheduledDate: "2027-01-10", order: 1 }),
        task({ id: "source-2", title: "数学整理", scheduledDate: "2027-01-11", order: 2 }),
      ])

      let writes = 0
      db.planTasks.hook("creating", () => {
        writes += 1
        if (writes === 2) {
          throw new Error("forced write error")
        }
      })

      await expect(copyTasksToPeriod(db, ["source-1", "source-2"], period(), "2027-01-10", 200)).rejects.toThrow(
        "forced write error",
      )

      const allTasks = await db.planTasks.toArray()
      expect(allTasks.map((item) => item.id).sort()).toEqual(["source-1", "source-2"])
      expect(await db.planTasks.bulkGet(["source-1", "source-2"])).toEqual([
        expect.objectContaining({ id: "source-1", title: "英语阅读", scheduledDate: "2027-01-10" }),
        expect.objectContaining({ id: "source-2", title: "数学整理", scheduledDate: "2027-01-11" }),
      ])
    })
  })
})
