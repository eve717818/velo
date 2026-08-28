// @vitest-environment node

import sharp from "sharp"
import { describe, expect, it } from "vitest"

const assets = [
  {
    path: "public/brand/velow-mark.png",
    ink: [255, 255, 255],
    accent: [144, 29, 120],
  },
  {
    path: "public/brand/velow-lockup-horizontal.png",
    ink: [144, 29, 120],
    accent: [24, 21, 23],
  },
  {
    path: "public/brand/velow-wordmark-vertical.png",
    ink: [24, 21, 23],
    accent: [24, 21, 23],
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

async function containsOpaqueBlack(assetPath: string) {
  const { data } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 8 && data[index] < 40 && data[index + 1] < 40 && data[index + 2] < 40) {
      return true
    }
  }

  return false
}

describe("standalone Velow Notebook logo assets", () => {
  it("rasterize with their ink and violet accent colors", async () => {
    for (const asset of assets) {
      await expect(containsColor(asset.path, asset.ink)).resolves.toBe(true)
      await expect(containsColor(asset.path, asset.accent)).resolves.toBe(true)
    }
  })

  it("keeps generated mark-layer padding transparent", async () => {
    await expect(containsOpaqueBlack("public/brand/velow-mark-base.png")).resolves.toBe(false)
    await expect(containsOpaqueBlack("public/brand/velow-mark-curve.png")).resolves.toBe(false)
  })
})
