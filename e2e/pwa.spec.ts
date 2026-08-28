import { expect, test } from "@playwright/test"

interface WebManifest {
  name: string
  display: string
  start_url: string
  icons: unknown[]
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
})

test("ships an installable manifest and activated service worker", async ({ page, request }) => {
  await page.goto("/")
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href")
  expect(manifestHref).toBeTruthy()

  const manifestResponse = await request.get(manifestHref!)
  expect(manifestResponse.ok()).toBe(true)
  const manifest = (await manifestResponse.json()) as WebManifest
  expect(manifest).toMatchObject({ name: "Velow Notebook", display: "standalone", start_url: "/" })
  expect(manifest.icons).toHaveLength(3)

  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const worker = registration.active
    if (!worker) return "missing"
    if (worker.state === "activated") return worker.state

    await new Promise<void>((resolve) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve()
      })
    })
    return worker.state
  })
  expect(state).toBe("activated")
})

test("reopens the local cockpit while offline", async ({ context, page }) => {
  await page.goto("/")
  await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('[data-app-name="Velow Notebook"]')).toBeVisible()
  await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()
})
