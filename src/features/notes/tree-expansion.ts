import type { VeloDB } from "@/db/velo-db"

const EXPANSION_KEY = "notes.expanded-folders"

export async function loadExpandedFolderIds(db: VeloDB): Promise<Set<string>> {
  const metadata = await db.appMeta.get(EXPANSION_KEY)
  if (!metadata) return new Set()

  try {
    const parsed: unknown = JSON.parse(metadata.value)
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) return new Set()
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

export async function saveExpandedFolderIds(db: VeloDB, ids: Set<string>, now: number): Promise<void> {
  const value = JSON.stringify([...ids].sort())
  await db.appMeta.put({ key: EXPANSION_KEY, value, updatedAt: now })
}
