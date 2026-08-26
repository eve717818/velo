import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { spawnSync } from "node:child_process"
import { chromium } from "@playwright/test"

const root = process.cwd()
const dist = join(root, "dist")
const pnpm = "pnpm"

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

function build(buildId) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : pnpm
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm build"] : ["build"]
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, VITE_BUILD_ID: buildId },
    encoding: "utf8",
    stdio: "pipe",
  })

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "")
    process.stderr.write(result.stderr ?? "")
    if (result.error) process.stderr.write(`${result.error}\n`)
    throw new Error(`Velo ${buildId} build failed.`)
  }
}

function resolveAsset(url) {
  const requestPath = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname)
  const relativePath = normalize(requestPath).replace(/^([/\\])+/, "")
  const candidate = join(dist, relativePath)

  if (candidate.startsWith(dist) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate
  }

  return join(dist, "index.html")
}

function createStaticServer() {
  return createServer((request, response) => {
    const asset = resolveAsset(request.url ?? "/")
    response.setHeader("Cache-Control", "no-store")
    response.setHeader("Content-Type", contentTypes[extname(asset)] ?? "application/octet-stream")
    createReadStream(asset).pipe(response)
  })
}

let browser
let server

try {
  build("pwa-v1")

  server = createStaticServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Static server did not expose a port.")

  browser = await chromium.launch({ channel: "chrome" })
  const context = await browser.newContext()
  const page = await context.newPage()
  const url = `http://127.0.0.1:${address.port}`

  await page.goto(url)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.locator('[data-build-id="pwa-v1"]').waitFor()

  build("pwa-v2")
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })

  await page.getByText("发现 Velo 新版本").waitFor({ timeout: 30_000 })
  await page.getByRole("button", { name: "立即更新" }).click()
  await page.locator('[data-build-id="pwa-v2"]').waitFor({ timeout: 30_000 })

  process.stdout.write("PWA lifecycle verified: pwa-v1 -> prompt -> pwa-v2.\n")
} finally {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve) ?? resolve())
}
