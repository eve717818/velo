import { describe, expect, it } from "vitest"
import { getFlowTransition } from "./motion-config"

describe("getFlowTransition", () => {
  it("removes time and displacement when the user prefers reduced motion", () => {
    expect(getFlowTransition(true)).toEqual({ duration: 0 })
  })

  it("uses the approved bounded flow timing otherwise", () => {
    expect(getFlowTransition(false)).toMatchObject({
      duration: 0.28,
      ease: [0.2, 0.8, 0.2, 1],
    })
  })
})
