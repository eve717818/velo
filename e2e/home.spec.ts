import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const widths = [375, 390, 768, 834, 1024, 1440]

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("welcome screen")) return
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
})

for (const width of widths) {
  test(`home cockpit reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/")

    await expect(page.getByText("高等数学 · 导数复习")).toBeVisible()
    await expect(page.getByText("还没有笔记")).toBeVisible()
    await expect(page.getByText("线性代数：矩阵的秩")).toHaveCount(0)
    await expect(page.getByRole("region", { name: "今日学习工作台" })).toHaveAttribute("data-layout", "bento")
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)

    const rail = page.getByLabel("Velow Notebook 侧边栏")
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
    ["笔记", "笔记工作台"],
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

test("desktop quick actions stay compact when their panel shares a column", async ({ page }) => {
  await page.setViewportSize({ width: 1081, height: 898 })
  await page.goto("/")

  const actions = page.locator('[data-bento-card="actions"] a')
  await expect(actions).toHaveCount(3)

  const layout = await actions.evaluateAll((links) =>
    links.map((link) => {
      const label = link.querySelector("strong")!
      const description = link.querySelector("small")!
      return {
        cardHeight: link.getBoundingClientRect().height,
        descriptionDisplay: window.getComputedStyle(description).display,
        labelHeight: label.getBoundingClientRect().height,
      }
    }),
  )

  for (const action of layout) {
    expect(action.cardHeight).toBeLessThanOrEqual(110)
    expect(action.labelHeight).toBeLessThanOrEqual(20)
    expect(action.descriptionDisplay).toBe("none")
  }
})

test("mobile welcome screen matches the reference proportions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto("/")

  const launchScreen = page.getByRole("region", { name: "Velow Notebook 欢迎页" })
  await expect(launchScreen).toBeVisible()
  await page.waitForTimeout(1900)

  const placement = await launchScreen.evaluate((element) => {
    const logoBounds = element.querySelector('[role="img"]')!.getBoundingClientRect()
    const promiseBounds = element.querySelector("p")!.getBoundingClientRect()
    const buttonBounds = element.querySelector("button")!.getBoundingClientRect()
    return {
      buttonBottom: buttonBounds.bottom,
      buttonHeight: buttonBounds.height,
      buttonWidth: buttonBounds.width,
      logoCenter: logoBounds.left + logoBounds.width / 2,
      logoTop: logoBounds.top,
      logoWidth: logoBounds.width,
      promiseTop: promiseBounds.top,
    }
  })

  expect(Math.abs(placement.logoCenter - 195)).toBeLessThanOrEqual(2)
  expect(placement.logoTop).toBeGreaterThanOrEqual(170)
  expect(placement.logoTop).toBeLessThanOrEqual(205)
  expect(placement.logoWidth).toBeGreaterThanOrEqual(125)
  expect(placement.logoWidth).toBeLessThanOrEqual(145)
  expect(placement.promiseTop).toBeGreaterThanOrEqual(380)
  expect(placement.promiseTop).toBeLessThanOrEqual(410)
  expect(placement.buttonWidth).toBeGreaterThanOrEqual(285)
  expect(placement.buttonWidth).toBeLessThanOrEqual(305)
  expect(placement.buttonHeight).toBeGreaterThanOrEqual(48)
  expect(placement.buttonHeight).toBeLessThanOrEqual(58)
  expect(placement.buttonBottom).toBeGreaterThanOrEqual(790)
  expect(placement.buttonBottom).toBeLessThanOrEqual(815)
})

test("tablet welcome screen matches the reference layout and waits for Get started", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("e2e:onboarding-reset") === "1") return
    window.localStorage.clear()
    window.sessionStorage.setItem("e2e:onboarding-reset", "1")
  })
  await page.goto("/")

  const launchScreen = page.getByRole("region", { name: "Velow Notebook 欢迎页" })
  await expect(launchScreen).toBeVisible()
  await expect(page.getByText("Catch ideas")).toBeVisible()
  await expect(page.getByText("Keep flowing")).toBeVisible()

  const placement = await launchScreen.evaluate((element) => {
    const logoBounds = element.querySelector('[role="img"]')!.getBoundingClientRect()
    const promiseBounds = element.querySelector("p")!.getBoundingClientRect()
    const buttonBounds = element.querySelector("button")!.getBoundingClientRect()
    return {
      buttonBottom: buttonBounds.bottom,
      buttonWidth: buttonBounds.width,
      logoCenter: logoBounds.left + logoBounds.width / 2,
      logoTop: logoBounds.top,
      logoWidth: logoBounds.width,
      promiseTop: promiseBounds.top,
    }
  })

  expect(Math.abs(placement.logoCenter - 590)).toBeLessThanOrEqual(2)
  expect(placement.logoTop).toBeGreaterThanOrEqual(50)
  expect(placement.logoTop).toBeLessThanOrEqual(80)
  expect(placement.logoWidth).toBeGreaterThanOrEqual(105)
  expect(placement.logoWidth).toBeLessThanOrEqual(125)
  expect(placement.promiseTop).toBeGreaterThanOrEqual(220)
  expect(placement.promiseTop).toBeLessThanOrEqual(270)
  expect(placement.buttonWidth).toBeGreaterThanOrEqual(270)
  expect(placement.buttonWidth).toBeLessThanOrEqual(320)
  expect(placement.buttonBottom).toBeGreaterThanOrEqual(780)
  await page.waitForTimeout(2200)
  await expect(launchScreen).toBeVisible()
  await page.getByRole("button", { name: "Get started" }).click()
  await expect(launchScreen).toBeHidden()
  await expect(page.getByRole("heading", { name: /好，Alex$/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("region", { name: "Velow Notebook 欢迎页" })).toHaveCount(0)
})
