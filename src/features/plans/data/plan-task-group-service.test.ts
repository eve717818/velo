import { describe, expect, it } from "vitest"

import { VeloDB } from "@/db/velo-db"

import {
  applyTaskGroupSchedule,
  createPlanTaskGroup,
  deletePlanTaskGroup,
  type CreatePlanTaskGroupInput,
  updatePlanTaskGroup,
} from "./plan-task-group-service"

async function withDatabase(run: (db: VeloDB) => Promise<void>) {
  const db = new VeloDB(`velo-task-group-test-${crypto.randomUUID()}`)
  try {
    await run(db)
  } finally {
    await db.delete()
  }
}

function validInput(): CreatePlanTaskGroupInput {
  return {
    title: "完成高数第三章",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    sessionCount: 3,
    estimatedMinutes: 45,
    steps: [
      {
        scheduledDate: "2026-09-01",
        title: "完成高数第三章",
        stepIndex: 1,
        stepTitleMode: "inherit",
      },
      {
        scheduledDate: "2026-09-04",
        title: "极限与连续",
        stepIndex: 2,
        stepTitleMode: "custom",
      },
      {
        scheduledDate: "2026-09-07",
        title: "完成高数第三章",
        stepIndex: 3,
        stepTitleMode: "inherit",
      },
    ],
  }
}

describe("plan task group service", () => {
  it("creates the group and all steps in one transaction", async () => {
    await withDatabase(async (db) => {
      const result = await createPlanTaskGroup(db, validInput(), 100)

      expect(result.tasks.map(({ groupId, stepIndex }) => ({ groupId, stepIndex }))).toEqual([
        { groupId: result.group.id, stepIndex: 1 },
        { groupId: result.group.id, stepIndex: 2 },
        { groupId: result.group.id, stepIndex: 3 },
      ])
      expect(result.tasks).toEqual([
        expect.objectContaining({ title: "完成高数第三章", stepTitleMode: "inherit", order: 1 }),
        expect.objectContaining({ title: "极限与连续", stepTitleMode: "custom", order: 1 }),
        expect.objectContaining({ title: "完成高数第三章", stepTitleMode: "inherit", order: 1 }),
      ])
      expect(await db.planTaskGroups.count()).toBe(1)
      expect(await db.planTasks.count()).toBe(3)
    })
  })

  it("rolls back the group when one step write fails", async () => {
    await withDatabase(async (db) => {
      db.planTasks.hook("creating", () => {
        throw new Error("step write failed")
      })

      await expect(createPlanTaskGroup(db, validInput(), 100)).rejects.toThrow("step write failed")
      expect(await db.planTaskGroups.count()).toBe(0)
      expect(await db.planTasks.count()).toBe(0)
    })
  })

  it.each([
    [{ ...validInput(), title: "  " }, "任务名称不能为空"],
    [{ ...validInput(), startDate: "2026-02-31" }, "任务日期无效"],
    [{ ...validInput(), sessionCount: 2 }, "学习次数必须与步骤数量一致"],
    [
      {
        ...validInput(),
        steps: validInput().steps.map((step, index) =>
          index === 1 ? { ...step, scheduledDate: "2026-09-01" } : step,
        ),
      },
      "同一任务组每天最多安排一次学习",
    ],
    [
      {
        ...validInput(),
        steps: validInput().steps.map((step, index) =>
          index === 1 ? { ...step, stepIndex: 3 } : step,
        ),
      },
      "步骤序号必须从 1 连续排列",
    ],
    [{ ...validInput(), estimatedMinutes: 12.5 }, "预计时长必须是正整数"],
  ])("rejects invalid group input before writing %#", async (input, message) => {
    await withDatabase(async (db) => {
      await expect(createPlanTaskGroup(db, input, 100)).rejects.toThrow(message)
      expect(await db.planTaskGroups.count()).toBe(0)
      expect(await db.planTasks.count()).toBe(0)
    })
  })

  it("continues the ordinary untimed order on each scheduled date", async () => {
    await withDatabase(async (db) => {
      await db.planTasks.add({
        id: "ordinary",
        title: "普通任务",
        scheduledDate: "2026-09-01",
        isCompleted: 0,
        order: 3,
        createdAt: 1,
        updatedAt: 1,
      })

      const created = await createPlanTaskGroup(db, validInput(), 100)
      expect(created.tasks[0].order).toBe(4)
    })
  })

  it("preserves completed and custom-titled steps while adding a new session", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)
      const completed = created.tasks[0]
      await db.planTasks.update(completed.id, { isCompleted: 1, completedAt: 110, updatedAt: 110 })

      const updated = await updatePlanTaskGroup(
        db,
        created.group.id,
        {
          ...validInput(),
          title: "高数第三章总复习",
          endDate: "2026-09-08",
          sessionCount: 4,
          steps: [
            { scheduledDate: "2026-09-02", title: "不得覆盖完成记录", stepIndex: 1, stepTitleMode: "inherit" },
            { scheduledDate: "2026-09-03", title: "不得覆盖自定义标题", stepIndex: 2, stepTitleMode: "inherit" },
            { scheduledDate: "2026-09-06", title: "高数第三章总复习", stepIndex: 3, stepTitleMode: "inherit" },
            { scheduledDate: "2026-09-08", title: "高数第三章总复习", stepIndex: 4, stepTitleMode: "inherit" },
          ],
        },
        120,
      )

      expect(updated.group).toMatchObject({ title: "高数第三章总复习", sessionCount: 4, updatedAt: 120 })
      expect(updated.tasks).toEqual([
        expect.objectContaining({
          id: completed.id,
          title: "完成高数第三章",
          scheduledDate: "2026-09-01",
          isCompleted: 1,
          completedAt: 110,
        }),
        expect.objectContaining({ title: "极限与连续", scheduledDate: "2026-09-03", stepTitleMode: "custom" }),
        expect.objectContaining({ title: "高数第三章总复习", scheduledDate: "2026-09-06" }),
        expect.objectContaining({ title: "高数第三章总复习", scheduledDate: "2026-09-08", stepIndex: 4 }),
      ])
    })
  })

  it("requires explicit confirmation before deleting omitted unfinished steps", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)
      const reduced = {
        ...validInput(),
        sessionCount: 2,
        steps: validInput().steps.slice(0, 2),
      }

      await expect(updatePlanTaskGroup(db, created.group.id, reduced, 120)).rejects.toThrow(
        "减少学习次数需要确认删除步骤",
      )
      expect(await db.planTasks.where("groupId").equals(created.group.id).count()).toBe(3)

      const updated = await updatePlanTaskGroup(
        db,
        created.group.id,
        { ...reduced, confirmedRemovedStepIds: [created.tasks[2].id] },
        121,
      )
      expect(updated.tasks).toHaveLength(2)
      expect(await db.planTasks.get(created.tasks[2].id)).toBeUndefined()
    })
  })

  it("never removes a completed step when reducing the session count", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)
      await db.planTasks.update(created.tasks[2].id, { isCompleted: 1, completedAt: 110 })

      await expect(
        updatePlanTaskGroup(
          db,
          created.group.id,
          {
            ...validInput(),
            sessionCount: 2,
            steps: validInput().steps.slice(0, 2),
            confirmedRemovedStepIds: [created.tasks[2].id],
          },
          120,
        ),
      ).rejects.toThrow("不能删除已完成的学习步骤")
      expect(await db.planTasks.get(created.tasks[2].id)).toMatchObject({ isCompleted: 1 })
    })
  })

  it("applies only current, incomplete proposals that belong to the group", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)
      await db.planTasks.update(created.tasks[0].id, { isCompleted: 1, completedAt: 110 })
      await db.planTasks.add({
        id: "foreign",
        title: "普通任务",
        scheduledDate: "2026-09-02",
        isCompleted: 0,
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      })

      await expect(
        applyTaskGroupSchedule(
          db,
          created.group.id,
          [{ taskId: created.tasks[0].id, previousDate: "2026-09-01", scheduledDate: "2026-09-02" }],
          120,
        ),
      ).rejects.toThrow("不能调整已完成的学习步骤")
      await expect(
        applyTaskGroupSchedule(
          db,
          created.group.id,
          [{ taskId: "foreign", previousDate: "2026-09-02", scheduledDate: "2026-09-03" }],
          120,
        ),
      ).rejects.toThrow("调整建议包含其他任务组的步骤")
      await expect(
        applyTaskGroupSchedule(
          db,
          created.group.id,
          [{ taskId: created.tasks[1].id, previousDate: "2026-09-03", scheduledDate: "2026-09-05" }],
          120,
        ),
      ).rejects.toThrow("步骤日期已变化，请重新生成建议")

      const updated = await applyTaskGroupSchedule(
        db,
        created.group.id,
        [{ taskId: created.tasks[1].id, previousDate: "2026-09-04", scheduledDate: "2026-09-05" }],
        121,
      )
      expect(updated.find((task) => task.id === created.tasks[1].id)).toMatchObject({
        scheduledDate: "2026-09-05",
        updatedAt: 121,
      })
    })
  })

  it("rolls back every proposed date when a bulk update fails", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)
      let updates = 0
      db.planTasks.hook("updating", () => {
        updates += 1
        if (updates === 2) throw new Error("bulk update failed")
      })

      await expect(
        applyTaskGroupSchedule(
          db,
          created.group.id,
          [
            { taskId: created.tasks[0].id, previousDate: "2026-09-01", scheduledDate: "2026-09-02" },
            { taskId: created.tasks[1].id, previousDate: "2026-09-04", scheduledDate: "2026-09-05" },
          ],
          120,
        ),
      ).rejects.toThrow("bulk update failed")

      expect((await db.planTasks.get(created.tasks[0].id))?.scheduledDate).toBe("2026-09-01")
      expect((await db.planTasks.get(created.tasks[1].id))?.scheduledDate).toBe("2026-09-04")
    })
  })

  it("deletes a group and every linked step atomically", async () => {
    await withDatabase(async (db) => {
      const created = await createPlanTaskGroup(db, validInput(), 100)

      await expect(deletePlanTaskGroup(db, "missing")).rejects.toThrow("Plan task group not found")
      await expect(deletePlanTaskGroup(db, created.group.id)).resolves.toEqual({ deletedTaskCount: 3 })
      expect(await db.planTaskGroups.get(created.group.id)).toBeUndefined()
      expect(await db.planTasks.where("groupId").equals(created.group.id).count()).toBe(0)
    })
  })

  it("rejects updates and schedules for a missing group", async () => {
    await withDatabase(async (db) => {
      await expect(updatePlanTaskGroup(db, "missing", validInput(), 100)).rejects.toThrow(
        "Plan task group not found",
      )
      await expect(applyTaskGroupSchedule(db, "missing", [], 100)).rejects.toThrow(
        "Plan task group not found",
      )
    })
  })
})
