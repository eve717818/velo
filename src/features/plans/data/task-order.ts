import type { PlanTask } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

function isSameLane(task: Pick<PlanTask, "startMinutes">, startMinutes: number | undefined) {
  return (task.startMinutes === undefined) === (startMinutes === undefined)
}

export async function getNextTaskOrder(
  db: VeloDB,
  scheduledDate: string,
  startMinutes: number | undefined,
): Promise<number> {
  const tasks = await db.planTasks.where("scheduledDate").equals(scheduledDate).toArray()
  const maxOrder = tasks
    .filter((task) => isSameLane(task, startMinutes))
    .reduce((currentMax, task) => Math.max(currentMax, task.order), 0)

  return maxOrder + 1
}
