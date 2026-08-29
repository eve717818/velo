import type { VeloDB } from "@/db/velo-db"

export function periodMigrationDismissalKey(sourceId: string, targetId: string) {
  return `periodMigrationDismissed:${sourceId}:${targetId}`
}

export async function dismissPeriodMigration(db: VeloDB, sourceId: string, targetId: string) {
  const key = periodMigrationDismissalKey(sourceId, targetId)
  await db.transaction("rw", db.appMeta, async () => {
    await db.appMeta.put({ key, value: "1", updatedAt: Date.now() })
  })
}

export async function reopenPeriodMigration(db: VeloDB, sourceId: string, targetId: string) {
  await db.transaction("rw", db.appMeta, async () => {
    await db.appMeta.delete(periodMigrationDismissalKey(sourceId, targetId))
  })
}
