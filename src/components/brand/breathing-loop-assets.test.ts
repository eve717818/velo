// @vitest-environment node

import { readFile } from "node:fs/promises"

import sharp from "sharp"
import { describe, expect, it } from "vitest"

const root = "docs/design/logo-exploration/v2"
const assets = {
  mark: `${root}/breathing-loop-mark.svg`,
  wordmark: `${root}/velo-refined-wordmark.svg`,
  lockup: `${root}/breathing-loop-lockup.svg`,
}

const ink = [11, 11, 12]
const accent = [109, 93, 252]

async function raster(assetPath: string, size: number) {
  return sharp(assetPath)
    .resize(size, size, { fit: "contain" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

function countOpaquePixels(data: Buffer) {
  let count = 0

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) count += 1
  }

  return count
}

function containsColor(data: Buffer, color: number[]) {
  for (let index = 0; index < data.length; index += 4) {
    if (color.every((channel, offset) => data[index + offset] === channel)) return true
  }

  return false
}

describe("Breathing Loop V2 logo assets", () => {
  it("renders every asset at favicon and presentation sizes", async () => {
    for (const assetPath of Object.values(assets)) {
      const small = await raster(assetPath, 16)
      const large = await raster(assetPath, 512)

      expect(countOpaquePixels(small.data)).toBeGreaterThan(8)
      expect(countOpaquePixels(large.data)).toBeGreaterThan(1_000)
    }
  })

  it("keeps the lettering font-independent and the violet node modular", async () => {
    const wordmarkSource = await readFile(assets.wordmark, "utf8")
    const wordmarkRaster = await raster(assets.wordmark, 512)
    const markRaster = await raster(assets.mark, 512)
    const lockupRaster = await raster(assets.lockup, 512)

    expect(wordmarkSource).not.toContain("<text")
    expect(containsColor(wordmarkRaster.data, ink)).toBe(true)
    expect(containsColor(wordmarkRaster.data, accent)).toBe(false)
    expect(containsColor(markRaster.data, ink)).toBe(true)
    expect(containsColor(markRaster.data, accent)).toBe(true)
    expect(containsColor(lockupRaster.data, ink)).toBe(true)
    expect(containsColor(lockupRaster.data, accent)).toBe(true)
  })
})
