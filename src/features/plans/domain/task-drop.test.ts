import { describe, expect, it } from "vitest"

import { readTaskDropTarget } from "./task-drop"

describe("task drop targets", () => {
  it("reads timed and untimed drop zones", () => {
    const timed = document.createElement("div")
    timed.dataset.dropPeriodKey = "2026-08-29"
    timed.dataset.startMinutes = "840"
    const untimed = document.createElement("div")
    untimed.dataset.dropPeriodKey = "2026-08-29"

    expect(readTaskDropTarget(timed)).toEqual({ scope: "day", periodKey: "2026-08-29", startMinutes: 840 })
    expect(readTaskDropTarget(untimed)).toEqual({ scope: "day", periodKey: "2026-08-29", startMinutes: undefined })
  })

  it("finds a drop zone from a nested event target", () => {
    const zone = document.createElement("div")
    zone.dataset.dropPeriodKey = "2026-08-29"
    const child = document.createElement("span")
    zone.append(child)

    expect(readTaskDropTarget(child)).toEqual({ scope: "day", periodKey: "2026-08-29", startMinutes: undefined })
  })

  it("accepts the inclusive minute boundaries", () => {
    const midnight = document.createElement("div")
    midnight.dataset.dropPeriodKey = "2026-08-29"
    midnight.dataset.startMinutes = "0"
    const finalMinute = document.createElement("div")
    finalMinute.dataset.dropPeriodKey = "2026-08-29"
    finalMinute.dataset.startMinutes = "1439"

    expect(readTaskDropTarget(midnight)).toEqual({ scope: "day", periodKey: "2026-08-29", startMinutes: 0 })
    expect(readTaskDropTarget(finalMinute)).toEqual({ scope: "day", periodKey: "2026-08-29", startMinutes: 1439 })
  })

  it("rejects invalid date and minute attributes", () => {
    const invalidDate = document.createElement("div")
    invalidDate.dataset.dropPeriodKey = "2026-02-31"
    const nanMinutes = document.createElement("div")
    nanMinutes.dataset.dropPeriodKey = "2026-08-29"
    nanMinutes.dataset.startMinutes = "eight"
    const outOfRangeMinutes = document.createElement("div")
    outOfRangeMinutes.dataset.dropPeriodKey = "2026-08-29"
    outOfRangeMinutes.dataset.startMinutes = "1440"
    const fractionalMinutes = document.createElement("div")
    fractionalMinutes.dataset.dropPeriodKey = "2026-08-29"
    fractionalMinutes.dataset.startMinutes = "840.5"

    expect(readTaskDropTarget(invalidDate)).toBeNull()
    expect(readTaskDropTarget(nanMinutes)).toBeNull()
    expect(readTaskDropTarget(outOfRangeMinutes)).toBeNull()
    expect(readTaskDropTarget(fractionalMinutes)).toBeNull()
  })

  it("ignores the removed legacy drop-date attribute", () => {
    const legacyTarget = document.createElement("div")
    legacyTarget.dataset.dropDate = "2026-08-29"

    expect(readTaskDropTarget(legacyTarget)).toBeNull()
  })
})
