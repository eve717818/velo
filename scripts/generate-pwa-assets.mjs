import sharp from "sharp"

const source = "public/brand/velo-mark.svg"

await Promise.all([
  sharp(source).resize(192, 192).png().toFile("public/pwa-192x192.png"),
  sharp(source).resize(512, 512).png().toFile("public/pwa-512x512.png"),
  sharp(source)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#f3f3f1" })
    .png()
    .toFile("public/maskable-512x512.png"),
])
