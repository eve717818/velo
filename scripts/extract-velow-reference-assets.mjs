import { resolve } from "node:path"
import sharp from "sharp"

const inputPath = process.argv[2]

if (!inputPath) {
  throw new Error("Pass the approved Velow Notebook logo reference image path.")
}

const outputRoot = resolve("public/brand")
const brand = [144, 29, 120]
const ink = [24, 21, 23]
const source = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { data, info } = source

function pixelOffset(x, y) {
  return (y * info.width + x) * info.channels
}

function pixelAt(x, y) {
  const offset = pixelOffset(x, y)
  return [data[offset], data[offset + 1], data[offset + 2]]
}

function isPurple([red, green, blue]) {
  return red >= 90 && red <= 195 && green <= 105 && blue >= 65 && blue <= 185 && red - green >= 45 && blue - green >= 25
}

function isInk([red, green, blue]) {
  return red < 205 && green < 205 && blue < 205
}

function findBounds(predicate, limits) {
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1

  for (let y = limits.top; y < limits.bottom; y += 1) {
    for (let x = limits.left; x < limits.right; x += 1) {
      if (!predicate(pixelAt(x, y))) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) throw new Error("Could not locate the requested logo region.")
  return { left, top, right: right + 1, bottom: bottom + 1 }
}

function expand(bounds, padding) {
  return {
    left: Math.max(0, bounds.left - padding),
    top: Math.max(0, bounds.top - padding),
    right: Math.min(info.width, bounds.right + padding),
    bottom: Math.min(info.height, bounds.bottom + padding),
  }
}

function crop(bounds) {
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const pixels = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = pixelOffset(bounds.left + x, bounds.top + y)
      const targetOffset = (y * width + x) * 4
      data.copy(pixels, targetOffset, sourceOffset, sourceOffset + 4)
    }
  }

  return { pixels, width, height }
}

function transparentArtwork(bounds, includePurple) {
  const region = crop(bounds)
  const output = Buffer.alloc(region.pixels.length)

  for (let offset = 0; offset < region.pixels.length; offset += 4) {
    const red = region.pixels[offset]
    const green = region.pixels[offset + 1]
    const blue = region.pixels[offset + 2]
    const purple = includePurple && isPurple([red, green, blue])
    const alpha = purple
      ? Math.round(Math.max(0, Math.min(1, (255 - green) / (255 - brand[1]))) * 255)
      : Math.round(Math.max(0, Math.min(1, (255 - (red + green + blue) / 3) / (255 - ink[0]))) * 255)
    const color = purple ? brand : ink

    output[offset] = color[0]
    output[offset + 1] = color[1]
    output[offset + 2] = color[2]
    output[offset + 3] = alpha < 8 ? 0 : alpha
  }

  return { ...region, pixels: output }
}

async function writePng(fileName, artwork, resize) {
  let pipeline = sharp(artwork.pixels, {
    raw: { width: artwork.width, height: artwork.height, channels: 4 },
  })

  if (resize) {
    pipeline = pipeline.resize(resize.width, resize.height, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: "contain",
    })
  }
  await pipeline.png().toFile(resolve(outputRoot, fileName))
}

const upperPurple = findBounds(isPurple, {
  left: 1,
  top: 1,
  right: info.width - 1,
  bottom: Math.floor(info.height / 2),
})
const lowerPurple = findBounds(isPurple, {
  left: 1,
  top: Math.floor(info.height / 2),
  right: info.width - 1,
  bottom: info.height - 1,
})

const markBounds = expand(upperPurple, 8)
const markRegion = crop(markBounds)
const purpleMask = new Uint8Array(markRegion.width * markRegion.height)
const outside = new Uint8Array(markRegion.width * markRegion.height)

for (let y = 0; y < markRegion.height; y += 1) {
  for (let x = 0; x < markRegion.width; x += 1) {
    const offset = (y * markRegion.width + x) * 4
    purpleMask[y * markRegion.width + x] = isPurple([
      markRegion.pixels[offset],
      markRegion.pixels[offset + 1],
      markRegion.pixels[offset + 2],
    ]) ? 1 : 0
  }
}

const queue = []
function enqueueOutside(x, y) {
  const index = y * markRegion.width + x
  if (outside[index] || purpleMask[index]) return
  outside[index] = 1
  queue.push(index)
}

for (let x = 0; x < markRegion.width; x += 1) {
  enqueueOutside(x, 0)
  enqueueOutside(x, markRegion.height - 1)
}
for (let y = 0; y < markRegion.height; y += 1) {
  enqueueOutside(0, y)
  enqueueOutside(markRegion.width - 1, y)
}

for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const index = queue[cursor]
  const x = index % markRegion.width
  const y = Math.floor(index / markRegion.width)
  if (x > 0) enqueueOutside(x - 1, y)
  if (x + 1 < markRegion.width) enqueueOutside(x + 1, y)
  if (y > 0) enqueueOutside(x, y - 1)
  if (y + 1 < markRegion.height) enqueueOutside(x, y + 1)
}

const basePixels = Buffer.alloc(markRegion.pixels.length)
const curvePixels = Buffer.alloc(markRegion.pixels.length)

for (let index = 0; index < purpleMask.length; index += 1) {
  const offset = index * 4
  const inside = purpleMask[index] || !outside[index]
  if (inside) {
    basePixels[offset] = brand[0]
    basePixels[offset + 1] = brand[1]
    basePixels[offset + 2] = brand[2]
    basePixels[offset + 3] = 255
  }
  if (!purpleMask[index] && !outside[index]) {
    curvePixels[offset] = 255
    curvePixels[offset + 1] = 255
    curvePixels[offset + 2] = 255
    curvePixels[offset + 3] = 255
  }
}

const markBase = { ...markRegion, pixels: basePixels }
const markCurve = { ...markRegion, pixels: curvePixels }
await writePng("velow-mark-base.png", markBase, { width: 512, height: 512 })
await writePng("velow-mark-curve.png", markCurve, { width: 512, height: 512 })
await sharp(basePixels, { raw: { width: markRegion.width, height: markRegion.height, channels: 4 } })
  .composite([{ input: curvePixels, raw: { width: markRegion.width, height: markRegion.height, channels: 4 } }])
  .resize(512, 512, {
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    fit: "contain",
  })
  .png()
  .toFile(resolve(outputRoot, "velow-mark.png"))

const verticalWordBounds = expand(findBounds(isInk, {
  left: Math.max(1, upperPurple.left - 240),
  top: upperPurple.bottom + 24,
  right: Math.min(info.width - 1, upperPurple.right + 240),
  bottom: Math.min(info.height - 1, upperPurple.bottom + 520),
}), 8)
const horizontalBounds = expand(findBounds(isInk, {
  left: Math.max(1, lowerPurple.left - 24),
  top: Math.max(1, lowerPurple.top - 36),
  right: info.width - 24,
  bottom: Math.min(info.height - 1, lowerPurple.bottom + 36),
}), 8)

await writePng("velow-wordmark-vertical.png", transparentArtwork(verticalWordBounds, false))
await writePng("velow-lockup-horizontal.png", transparentArtwork(horizontalBounds, true))

console.log(JSON.stringify({ upperPurple, lowerPurple, verticalWordBounds, horizontalBounds }, null, 2))
