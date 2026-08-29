import { describe, expect, it } from "vitest"

import { buildFocusHref } from "./focus-link"

describe("buildFocusHref", () => {
  it("encodes the task id and uses a valid whole-minute estimate", () => {
    expect(buildFocusHref({ id: "math & science/1", estimatedMinutes: 45 })).toBe("/focus?task=math+%26+science%2F1&minutes=45")
  })

  it.each([undefined, 0, -1, 12.5, Number.NaN, Number.POSITIVE_INFINITY, 10_000])("uses 25 minutes for an invalid estimate of %s", (estimatedMinutes) => {
    expect(buildFocusHref({ id: "english", estimatedMinutes })).toBe("/focus?task=english&minutes=25")
  })
})
