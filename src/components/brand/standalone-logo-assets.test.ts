// @vitest-environment node

import sharp from "sharp"
import { describe, expect, it } from "vitest"

const assets = ["public/brand/velo-mark.svg", "public/brand/velo-wordmark.svg"]
const ink = [17, 19, 26]
const accent = [87, 79, 230]

async function containsColor(assetPath: string, color: number[]) {
  const { data } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let index = 0; index < data.length; index += 4) {
    if (color.every((channel, offset) => data[index + offset] === channel)) {
      return true
    }
  }

  return false
}

describe("standalone Velo logo assets", () => {
  it("rasterize with their ink and violet accent colors", async () => {
    for (const assetPath of assets) {
      await expect(containsColor(assetPath, ink)).resolves.toBe(true)
      await expect(containsColor(assetPath, accent)).resolves.toBe(true)
    }
  })
})
