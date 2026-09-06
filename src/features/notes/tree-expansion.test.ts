import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { loadExpandedFolderIds, saveExpandedFolderIds } from "./tree-expansion"

let db: VeloDB

beforeEach(() => {
  db = new VeloDB(`tree-expansion-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await db.delete()
})

describe("tree expansion persistence", () => {
  it("stores only unique folder IDs and recovers from invalid metadata", async () => {
    await saveExpandedFolderIds(db, new Set(["math", "math", "physics"]), 10)

    await expect(loadExpandedFolderIds(db)).resolves.toEqual(new Set(["math", "physics"]))

    await db.appMeta.put({ key: "notes.expanded-folders", value: "not-json", updatedAt: 11 })
    await expect(loadExpandedFolderIds(db)).resolves.toEqual(new Set())
  })
})
