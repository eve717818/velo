import { resolve } from "node:path"
import sharp from "sharp"

const [mobileReference, tabletReference] = process.argv.slice(2)

if (!mobileReference || !tabletReference) {
  throw new Error("Pass the mobile and tablet reference image paths.")
}

const qaRoot = resolve("docs/qa")

async function createComparison({
  reference,
  implementation,
  output,
  width,
  height,
  referenceFit,
}) {
  const normalizedReference = await sharp(reference)
    .resize(width, height, { fit: referenceFit, background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer()
  const normalizedImplementation = await sharp(resolve(qaRoot, implementation))
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer()

  await sharp({
    create: { width: width * 2, height, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: normalizedReference, left: 0, top: 0 },
      { input: normalizedImplementation, left: width, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toFile(resolve(qaRoot, output))
}

await createComparison({
  reference: mobileReference,
  implementation: "velow-welcome-mobile-390.png",
  output: "velow-welcome-mobile-comparison.jpg",
  width: 390,
  height: 844,
  referenceFit: "fill",
})

await createComparison({
  reference: tabletReference,
  implementation: "velow-welcome-tablet-1180.png",
  output: "velow-welcome-tablet-comparison.jpg",
  width: 1180,
  height: 820,
  referenceFit: "contain",
})

console.log("Generated mobile and tablet welcome-screen comparisons.")
