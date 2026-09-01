import type { PlanTask, PlanTaskScope } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

function isSameLane(task: Pick<PlanTask, "scope" | "startMinutes">, startMinutes: number | undefined) {
  return task.scope !== "day" || (task.startMinutes === undefined) === (startMinutes === undefined)
}

export async function getNextTaskOrder(
  db: VeloDB,
  scope: PlanTaskScope,
  periodKey: string,
  startMinutes: number | undefined,
): Promise<number> {
  const tasks = await db.planTasks.where("[scope+periodKey]").equals([scope, periodKey]).toArray()
  const maxOrder = tasks
    .filter((task) => isSameLane(task, startMinutes))
    .reduce((currentMax, task) => Math.max(currentMax, task.order), 0)

  return maxOrder + 1
}
