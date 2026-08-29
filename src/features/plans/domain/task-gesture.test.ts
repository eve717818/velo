import { describe, expect, it } from "vitest"

import { getSwipeProgress, shouldCompleteSwipe } from "./task-gesture"

describe("task gesture policy", () => {
  it("clamps right-swipe progress to the task-bar width", () => {
    expect(getSwipeProgress(70, 100)).toBe(0.7)
    expect(getSwipeProgress(-10, 100)).toBe(0)
    expect(getSwipeProgress(130, 100)).toBe(1)
    expect(getSwipeProgress(30, 0)).toBe(0)
  })

  it("completes only when a released swipe reaches 70 percent", () => {
    expect(shouldCompleteSwipe(69, 100)).toBe(false)
    expect(shouldCompleteSwipe(70, 100)).toBe(true)
  })
})
