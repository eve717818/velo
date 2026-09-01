import { describe, expect, it } from "vitest"

import { getSwipeProgress, shouldCompleteSwipe } from "./task-gesture"

describe("task gesture policy", () => {
  it("clamps right-swipe progress to the task-bar width", () => {
    expect(getSwipeProgress(70, 100)).toBe(0.7)
    expect(getSwipeProgress(-10, 100)).toBe(0)
    expect(getSwipeProgress(130, 100)).toBe(1)
    expect(getSwipeProgress(30, 0)).toBe(0)
  })

  it("completes at 45 percent or from a deliberate fast flick", () => {
    expect(shouldCompleteSwipe(44, 100, 0.2)).toBe(false)
    expect(shouldCompleteSwipe(45, 100, 0.2)).toBe(true)
    expect(shouldCompleteSwipe(20, 100, 0.75)).toBe(true)
    expect(shouldCompleteSwipe(19, 100, 1)).toBe(false)
  })
})
