import { describe, expect, it } from "vitest"

import { readTaskDropTarget } from "./task-drop"

describe("task drop targets", () => {
  it("reads timed and untimed drop zones", () => {
    const timed = document.createElement("div")
    timed.dataset.dropDate = "2026-08-29"
    timed.dataset.startMinutes = "840"
    const untimed = document.createElement("div")
    untimed.dataset.dropDate = "2026-08-29"

    expect(readTaskDropTarget(timed)).toEqual({ scheduledDate: "2026-08-29", startMinutes: 840 })
    expect(readTaskDropTarget(untimed)).toEqual({ scheduledDate: "2026-08-29", startMinutes: undefined })
  })

  it("finds a drop zone from a nested event target", () => {
    const zone = document.createElement("div")
    zone.dataset.dropDate = "2026-08-29"
    const child = document.createElement("span")
    zone.append(child)

    expect(readTaskDropTarget(child)).toEqual({ scheduledDate: "2026-08-29", startMinutes: undefined })
  })

  it("rejects invalid date and minute attributes", () => {
    const invalidDate = document.createElement("div")
    invalidDate.dataset.dropDate = "2026-02-31"
    const nanMinutes = document.createElement("div")
    nanMinutes.dataset.dropDate = "2026-08-29"
    nanMinutes.dataset.startMinutes = "eight"
    const outOfRangeMinutes = document.createElement("div")
    outOfRangeMinutes.dataset.dropDate = "2026-08-29"
    outOfRangeMinutes.dataset.startMinutes = "1440"

    expect(readTaskDropTarget(invalidDate)).toBeNull()
    expect(readTaskDropTarget(nanMinutes)).toBeNull()
    expect(readTaskDropTarget(outOfRangeMinutes)).toBeNull()
  })
})
