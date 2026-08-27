// @vitest-environment node

import { readFile } from "node:fs/promises"

import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"

const comparisonPage = "docs/design/logo-exploration/v2/typography.html"

async function loadComparisonDocument() {
  const source = await readFile(comparisonPage, "utf8")
  return new JSDOM(source).window.document
}

describe("Velo typography comparison", () => {
  it("presents three accessible standard-font lockups using the same mark", async () => {
    const document = await loadComparisonDocument()
    const directions = [...document.querySelectorAll<HTMLElement>("[data-font-direction]")]

    expect(directions.map((direction) => direction.dataset.fontDirection)).toEqual([
      "manrope",
      "outfit",
      "inter",
    ])

    for (const direction of directions) {
      const lockup = direction.querySelector<HTMLElement>("[role='img']")
      const mark = direction.querySelector("use")

      expect(lockup?.getAttribute("aria-label")).toContain("Velo")
      expect(mark?.getAttribute("href")).toBe("breathing-loop-mark.svg#breathing-loop-mark")
    }
  })

  it("keeps every letter independently positionable for optical kerning", async () => {
    const document = await loadComparisonDocument()
    const directions = [...document.querySelectorAll<HTMLElement>("[data-font-direction]")]

    for (const direction of directions) {
      const letters = [...direction.querySelectorAll<HTMLElement>("[data-letter]")]

      expect(letters.map((letter) => letter.textContent).join("")).toBe("Velo")
      expect(letters).toHaveLength(4)
    }
  })
})
