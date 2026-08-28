import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const widths = [375, 390, 768, 834, 1024, 1440]

for (const width of widths) {
  test(`home cockpit reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/")

    await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()
    await expect(page.getByText("线性代数：矩阵的秩")).toBeVisible()
    await expect(page.getByRole("region", { name: "今日学习工作台" })).toHaveAttribute("data-layout", "bento")
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)

    const rail = page.getByLabel("Velo 侧边栏")
    const mobileNav = page.locator('[class*="mobileNavigation"]')
    if (width < 768) {
      await expect(rail).toBeHidden()
      await expect(mobileNav).toBeVisible()
    } else {
      await expect(rail).toBeVisible()
      await expect(mobileNav).toBeHidden()
    }
  })
}

test("mobile navigation reaches every milestone surface including settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")

  for (const [label, heading] of [
    ["计划", "学习计划"],
    ["笔记", "知识笔记"],
    ["专注", "专注"],
  ] as const) {
    await page.getByRole("link", { name: label }).click()
    await expect(page.getByRole("heading", { name: heading })).toBeVisible()
  }

  await page.goto("/")
  await page.getByRole("button", { name: "打开菜单" }).click()
  await page.getByRole("menuitem", { name: "设置" }).click()
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible()
})

test("home has no automatically detectable accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByText("3 / 5")).toBeVisible()

  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations).toEqual([])
})

test("reduced motion keeps navigation immediately readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await page.getByRole("link", { name: "计划" }).click()
  await expect(page.getByRole("heading", { name: "学习计划" })).toBeVisible({ timeout: 100 })
})

test("next task uses a readable violet frosted-glass surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()

  const nextCard = page.locator('[data-bento-card="next"]')
  const appearance = await nextCard.evaluate((element) => {
    const styles = window.getComputedStyle(element)
    return {
      backdropFilter: styles.backdropFilter,
      backgroundColor: styles.backgroundColor,
      color: styles.color,
    }
  })

  expect(appearance.backdropFilter).toContain("blur(")
  expect(appearance.backgroundColor).toMatch(/^rgba\(.+, 0\.[4-8]\d*\)$/)
  expect(appearance.color).toBe("rgb(17, 17, 19)")
})

test("tablet launch screen scales the breathing loop before entering the cockpit", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.addInitScript(() => window.sessionStorage.clear())
  await page.goto("/")

  const launchScreen = page.getByRole("status", { name: "Velo 正在启动" })
  const breathingLoop = launchScreen.locator('span[aria-hidden="true"]')
  await expect(launchScreen).toBeVisible()
  await expect(page.getByText("Catch ideas,")).toBeVisible()
  await expect(page.getByText("Keep flowing")).toBeVisible()

  const placement = await breathingLoop.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      center: bounds.left + bounds.width / 2,
      width: bounds.width,
    }
  })

  expect(Math.abs(placement.center - 410)).toBeLessThanOrEqual(2)
  expect(placement.width).toBeGreaterThanOrEqual(180)
  await expect(launchScreen).toBeHidden({ timeout: 2200 })
  await expect(page.getByRole("heading", { name: "晚上好，Alex" })).toBeVisible()
})
