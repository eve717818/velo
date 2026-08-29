import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

import { parseLocalDate } from "../domain/plan-dates"

export class LegacyPlanDateError extends Error {
  constructor() {
    super("请选择有效日期")
    this.name = "LegacyPlanDateError"
  }
}

function assertRealLocalDate(value: string) {
  try { parseLocalDate(value) } catch { throw new LegacyPlanDateError() }
}

export async function convertLegacyPlanTask(db: VeloDB, legacyId: string, scheduledDate: string, now: number): Promise<PlanTask> {
  assertRealLocalDate(scheduledDate)
  return db.transaction("rw", db.legacyPlanTasks, db.planTasks, async () => {
    const legacy = await db.legacyPlanTasks.get(legacyId)
    if (!legacy) throw new Error("旧计划任务不存在")
    const sameDay = await db.planTasks.where("scheduledDate").equals(scheduledDate).toArray()
    const order = sameDay.filter((task) => task.startMinutes === undefined).reduce((max, task) => Math.max(max, task.order), 0) + 1
    const created: PlanTask = {
      id: crypto.randomUUID(), title: legacy.title, scheduledDate, subject: legacy.subject, estimatedMinutes: legacy.estimatedMinutes,
      isCompleted: legacy.isCompleted, completedAt: legacy.isCompleted ? now : undefined, order, createdAt: now, updatedAt: now,
    }
    await db.planTasks.add(created)
    await db.legacyPlanTasks.delete(legacy.id)
    return created
  })
}
