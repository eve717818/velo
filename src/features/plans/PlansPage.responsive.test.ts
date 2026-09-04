import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const pageCssPath = resolve(process.cwd(), "src/features/plans/PlansPage.module.css")
const taskBarCssPath = resolve(process.cwd(), "src/features/plans/components/TaskBar.module.css")

function block(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`${escaped}\\s*{[^}]*}`, "s")
}

describe("plan responsive CSS contract", () => {
  it("uses active list surfaces instead of calendar grids", async () => {
    const css = await readFile(pageCssPath, "utf8")

    for (const selector of [
      ".weekGrid",
      ".weekDateStrip",
      ".weekGroupBands",
      ".monthGrid",
      ".monthWeekDays",
      ".monthTaskPanel",
      ".rangePlanSummary",
      ".rangePlanButton",
    ]) {
      expect(css).not.toMatch(block(selector))
    }

    expect(css).toMatch(/\.planListSurface\s*{[^}]*min-width:\s*0[^}]*width:\s*100%/s)
    expect(css).toMatch(/\.planListSurface\s*>\s*ul\s*{[^}]*display:\s*grid[^}]*gap:\s*10px[^}]*list-style:\s*none[^}]*margin:\s*0[^}]*padding:\s*0/s)
    expect(css).not.toMatch(/grid-template-columns:\s*repeat\(7,/)
  })

  it("keeps navigation, empty states, and cards contained at narrow and wide widths", async () => {
    const css = await readFile(pageCssPath, "utf8")
    const taskBarCss = await readFile(taskBarCssPath, "utf8")

    expect(css).toMatch(/\.periodNavigator\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*min-width:\s*0/s)
    expect(css).toMatch(/\.periodNavigatorControl\s*{[^}]*box-sizing:\s*border-box[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s)
    expect(css).toMatch(/\.periodPicker\s*{[^}]*min-height:\s*44px[^}]*min-width:\s*0[^}]*width:\s*100%/s)
    expect(css).toMatch(/\.emptyCreateAction\s*{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/@media \(min-width:\s*1024px\)\s*{[^}]*\.workspaceGrid\s*{[^}]*margin-inline:\s*auto[^}]*max-width:\s*1040px/s)

    expect(taskBarCss).toMatch(/\.taskBarGroup\s*{[^}]*min-width:\s*0[^}]*width:\s*100%/s)
    expect(taskBarCss).toMatch(/\.taskBar\s*{[^}]*box-sizing:\s*border-box[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*width:\s*100%/s)
    expect(taskBarCss).toMatch(/\.copy\s*{[^}]*min-width:\s*0/s)
    expect(taskBarCss).toMatch(/\.taskTitle\s*{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s)
  })

  it("allows 200% text growth and removes decorative motion in reduced motion", async () => {
    const css = await readFile(pageCssPath, "utf8")
    const taskBarCss = await readFile(taskBarCssPath, "utf8")

    expect(css).toMatch(/\.surfaceHeading\s*{[^}]*flex-wrap:\s*wrap/s)
    expect(css).toMatch(/\.progressCopy\s*{[^}]*flex-wrap:\s*wrap/s)
    expect(css).toMatch(/\.planListSurface\s*>\s*ul\s*>\s*li\s*{[^}]*box-sizing:\s*border-box[^}]*min-width:\s*0/s)
    expect(taskBarCss).toMatch(/\.taskBar\s*{[^}]*min-height:\s*54px[^}]*height:\s*auto/s)
    expect(taskBarCss).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.completionFill,[^}]*\.copy,[^}]*\.swipeAffordance\s*{[^}]*transition:\s*none/s)
    expect(taskBarCss).not.toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*{[^}]*display:\s*none/s)
  })
})
