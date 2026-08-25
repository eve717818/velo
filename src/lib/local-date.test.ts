import { describe, expect, it } from "vitest"
import { formatLocalDate } from "./local-date"

describe("formatLocalDate", () => {
  it("formats a date using its local calendar values", () => {
    expect(formatLocalDate(new Date(2026, 7, 5, 23, 0))).toBe("2026-08-05")
  })
})
