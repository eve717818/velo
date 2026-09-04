import { expect, it, vi } from "vitest"
import { seedHomeDemo } from "./seed"
import { VeloDB } from "./velo-db"

it("initializes local data when HTTP does not expose randomUUID", async () => {
  const db = new VeloDB(`http-seed-${Date.now()}`)
  vi.spyOn(crypto, "randomUUID")
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined })
  try {
    await seedHomeDemo(db, new Date(2026, 8, 4))
    const tasks = await db.planTasks.toArray()
    expect(tasks).toHaveLength(5)
    expect(new Set(tasks.map(task => task.id)).size).toBe(5)
    expect(tasks.every(task => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(task.id))).toBe(true)
  } finally {
    vi.restoreAllMocks()
    await db.delete()
  }
})
