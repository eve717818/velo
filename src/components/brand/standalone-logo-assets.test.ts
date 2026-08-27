// @vitest-environment node

import sharp from "sharp"
import { describe, expect, it } from "vitest"

const assets = [
  {
    path: "public/brand/velo-mark.svg",
    ink: [11, 11, 12],
    accent: [109, 93, 252],
  },
  {
    path: "public/brand/velo-mark-reverse.svg",
    ink: [255, 255, 255],
    accent: [156, 144, 255],
  },
  {
    path: "public/brand/velo-wordmark.svg",
    ink: [17, 19, 26],
    accent: [87, 79, 230],
  },
]

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
    for (const asset of assets) {
      await expect(containsColor(asset.path, asset.ink)).resolves.toBe(true)
      await expect(containsColor(asset.path, asset.accent)).resolves.toBe(true)
    }
  })
})
