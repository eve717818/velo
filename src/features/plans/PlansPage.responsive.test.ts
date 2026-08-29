import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const cssPath = resolve(process.cwd(), "src/features/plans/PlansPage.module.css")

describe("plan responsive CSS contract", () => {
  it("keeps narrow mobile calendar targets readable and clear of fixed navigation", async () => {
    const css = await readFile(cssPath, "utf8")

    expect(css).toMatch(/\.weekDateStrip\s*{[^}]*grid-template-columns:\s*repeat\(4, minmax\(44px, 1fr\)\)/s)
    expect(css).toMatch(/@media \(min-width: 480px\)\s*{[^}]*\.weekDateStrip\s*{[^}]*grid-template-columns:\s*repeat\(7, minmax\(44px, 1fr\)\)/s)
    expect(css).toMatch(/\.weekDateButton\s*{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s)
    expect(css).toMatch(/\.monthDay\s*{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s)
    expect(css).toMatch(/\.monthCounts\s*{[^}]*font-size:\s*12px/s)
    expect(css).toMatch(/\.monthTaskPanel\s*{[^}]*bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom\)\)/s)
    expect(css).toMatch(/@media \(min-width: 768px\)/)
  })
})
