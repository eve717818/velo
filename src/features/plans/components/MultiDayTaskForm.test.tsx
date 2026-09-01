import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { VeloDB } from "@/db/velo-db"
import type { RequestSession } from "./useRequestSession"

import { MultiDayTaskForm } from "./MultiDayTaskForm"

const requestSession: RequestSession = { beginRequest: () => 1, invalidate: () => undefined, isCurrent: () => true }

describe("MultiDayTaskForm compatibility surface", () => {
  it("shows that cross-day tasks are retired without querying or writing plan task groups", async () => {
    const db = new VeloDB(`multi-day-retired-${crypto.randomUUID()}`)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const rendered = render(<MultiDayTaskForm db={db} initialDate="2026-09-01" onClose={onClose} requestSession={requestSession} />)
    try {
      expect(screen.getByText("跨日任务已停用")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "返回单日任务" }))
      expect(onClose).toHaveBeenCalledOnce()
      expect(await db.planTaskGroups.count()).toBe(0)
      expect(await db.planTasks.count()).toBe(0)
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
