import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"

const fixedToday = "2026-08-30"
const fixedTomorrow = "2026-08-31"
const semesterStart = "2026-09-01"
const semesterEnd = "2027-01-16"
const overlappingWinterStart = "2027-01-10"
const winterStart = "2027-01-17"
const winterEnd = "2027-02-21"
const widths = [375, 390, 768, 834, 1024, 1366, 1440]
type MockDateArgs =
  | []
  | [string | number | Date]
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]
  | [number, number, number, number, number]
  | [number, number, number, number, number, number]
  | [number, number, number, number, number, number, number]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ isoDate }) => {
    const fixedTime = new Date(`${isoDate}T09:00:00`).getTime()
    const RealDate = Date

    class MockDate extends RealDate {
      constructor(...args: MockDateArgs) {
        if (args.length === 0) {
          super(fixedTime)
          return
        }
        if (args.length === 1) {
          const [value] = args
          super(value)
          return
        }
        if (args.length === 2) {
          const [year, month] = args
          super(year, month)
          return
        }
        if (args.length === 3) {
          const [year, month, date] = args
          super(year, month, date)
          return
        }
        if (args.length === 4) {
          const [year, month, date, hours] = args
          super(year, month, date, hours)
          return
        }
        if (args.length === 5) {
          const [year, month, date, hours, minutes] = args
          super(year, month, date, hours, minutes)
          return
        }
        if (args.length === 6) {
          const [year, month, date, hours, minutes, seconds] = args
          super(year, month, date, hours, minutes, seconds)
          return
        }
        const [year, month, date, hours, minutes, seconds, milliseconds] = args
        super(year, month, date, hours, minutes, seconds, milliseconds)
      }

      static now() {
        return fixedTime
      }

      static parse(value: string) {
        return RealDate.parse(value)
      }

      static UTC(...args: Parameters<DateConstructor["UTC"]>) {
        return RealDate.UTC(...args)
      }
    }

    Object.defineProperty(window, "Date", {
      configurable: true,
      value: MockDate,
    })
    window.localStorage.setItem("velow-notebook:onboarding-complete", "1")
  }, { isoDate: fixedToday })
})

async function waitForPlanSeed(page: Page) {
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(page.getByRole("heading", { name: "学习计划" })).toBeVisible()
  await expect(page.getByRole("button", { name: "打开任务操作：高等数学 · 导数复习" })).toBeVisible()
}

function viewButton(page: Page, name: "日" | "周" | "月" | "学期") {
  return page.getByRole("group", { name: "计划视图" }).getByRole("button", { name, exact: true })
}

function statusByText(page: Page, text: string) {
  return page.getByRole("status").filter({ hasText: text })
}

function calendarDayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return `${year}年${month}月${day}日`
}

function monthDropTarget(page: Page, targetDate: string) {
  return page.getByRole("button", { name: new RegExp(`^${calendarDayLabel(targetDate)}，`) })
}

async function createTask(page: Page, input: {
  title: string
  scheduledDate: string
  estimatedMinutes?: string
  subject?: string
}) {
  const createTrigger = page.getByRole("link", { name: "新建任务" }).or(page.getByRole("button", { name: "新建任务" }))
  await createTrigger.click()

  const dialog = page.getByRole("dialog", { name: "新建学习任务" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("任务标题").fill(input.title)
  await dialog.getByLabel("日期").fill(input.scheduledDate)
  if (input.subject) await dialog.getByLabel("科目").fill(input.subject)
  if (input.estimatedMinutes) await dialog.getByLabel("预计时长（分钟）").fill(input.estimatedMinutes)
  await dialog.getByRole("button", { name: "保存任务" }).click()
  await expect(dialog).toBeHidden()
}

async function createMultiDayTask(page: Page, input: {
  title: string
  startDate: string
  endDate: string
  sessionCount: string
  subject?: string
}) {
  const createTrigger = page.getByRole("link", { name: "新建任务" }).or(page.getByRole("button", { name: "新建任务" }))
  await createTrigger.click()

  const dialog = page.getByRole("dialog", { name: "新建学习任务" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "跨日任务" }).click()
  await dialog.getByLabel("任务名称").fill(input.title)
  if (input.subject) await dialog.getByLabel("科目").fill(input.subject)
  await dialog.getByLabel("开始日期").fill(input.startDate)
  await dialog.getByLabel("截止日期").fill(input.endDate)
  await dialog.getByLabel("学习次数").fill(input.sessionCount)
  await dialog.getByRole("button", { name: "保存跨日任务" }).click()
  await expect(dialog).toBeHidden()
}

async function createPeriod(page: Page, input: {
  kind: "semester" | "winter-break"
  name: string
  startDate: string
  endDate: string
  goal?: string
}) {
  const trigger = page.getByRole("button", { name: "创建第一个学期或假期" }).or(page.getByRole("button", { name: "新建学期或假期" }))
  await trigger.click()

  const dialog = page.getByRole("dialog", { name: "新建学期或假期" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("学期或假期类型").selectOption(input.kind)
  await dialog.getByLabel("学期或假期名称").fill(input.name)
  await dialog.getByLabel("开始日期").fill(input.startDate)
  await dialog.getByLabel("结束日期").fill(input.endDate)
  if (input.goal) await dialog.getByLabel("学习目标").fill(input.goal)
  await dialog.getByRole("button", { name: "保存" }).click()
  return dialog
}

async function swipeToComplete(page: Page, taskTitle: string) {
  const task = page.getByRole("button", { name: `打开任务操作：${taskTitle}` })
  await task.scrollIntoViewIfNeeded()
  const box = await task.boundingBox()
  if (!box) throw new Error(`Task bar bounds missing for ${taskTitle}`)

  const startX = box.x + 18
  const endX = box.x + box.width - 18
  const centerY = box.y + box.height / 2

  await page.mouse.move(startX, centerY)
  await page.mouse.down()
  await page.mouse.move(endX, centerY, { steps: 2 })
  await page.mouse.up()
}

async function longPressDragToDate(page: Page, taskTitle: string, dropTarget: Locator, targetDate: string) {
  const task = page.getByRole("button", { name: `打开任务操作：${taskTitle}` })
  await task.scrollIntoViewIfNeeded()
  const taskBox = await task.boundingBox()
  if (!taskBox) throw new Error(`Task bar bounds missing for ${taskTitle}`)

  await expect(dropTarget).toHaveCount(1)
  await expect(dropTarget).toHaveAttribute("data-drop-date", targetDate)
  await expect(dropTarget).toBeVisible()
  const targetBox = await dropTarget.boundingBox()
  if (!targetBox) throw new Error(`Drop target bounds missing for ${targetDate}`)

  await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(380)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + Math.min(targetBox.height / 2, 24), { steps: 14 })
  await page.mouse.up()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

async function readBox(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Expected a visible element")
  return box
}

test("plans happy path supports day week month, swipe undo, drag to tomorrow, and home refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForPlanSeed(page)

  await createTask(page, {
    title: "复习导数",
    scheduledDate: fixedToday,
    estimatedMinutes: "45",
    subject: "高等数学",
  })

  const createdTask = page.getByRole("button", { name: "打开任务操作：复习导数" })
  await expect(createdTask).toBeVisible()

  await page.goto("/")
  await expect(page.getByText("3 / 6")).toBeVisible()

  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(createdTask).toBeVisible()
  await viewButton(page, "周").click()
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()
  await viewButton(page, "月").click()
  await page.getByRole("button", { name: /展开另外 \d+ 项任务/ }).click()
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()

  await swipeToComplete(page, "复习导数")
  await expect(page.getByRole("button", { name: "已完成：复习导数" })).toBeVisible()
  await expect(statusByText(page, "任务已完成")).toBeVisible()
  await page.getByRole("button", { name: "撤销" }).click()
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()

  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto(`/plans?view=month&date=${fixedToday}`)
  await page.getByRole("button", { name: /展开另外 \d+ 项任务/ }).click()
  const tomorrowMonthCell = monthDropTarget(page, fixedTomorrow)
  await longPressDragToDate(page, "复习导数", tomorrowMonthCell, fixedTomorrow)
  await expect(statusByText(page, "已移动到目标位置")).toBeVisible()
  await expect(page.getByRole("button", { name: "2026年8月31日，1 项任务，0 项完成" })).toBeVisible()
  await page.getByRole("button", { name: "撤销" }).click()
  await expect(page.getByRole("button", { name: "2026年8月31日，0 项任务，0 项完成" })).toBeVisible()
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()

  await longPressDragToDate(page, "复习导数", tomorrowMonthCell, fixedTomorrow)
  await expect(statusByText(page, "已移动到目标位置")).toBeVisible()
  await expect(page.getByRole("button", { name: "2026年8月31日，1 项任务，0 项完成" })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toHaveCount(0)
  await page.goto(`/plans?view=day&date=${fixedTomorrow}`)
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()

  await page.goto(`/plans?view=week&date=${fixedTomorrow}`)
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()
  await page.goto(`/plans?view=month&date=${fixedTomorrow}`)
  await expect(page.getByRole("button", { name: "打开任务操作：复习导数" })).toBeVisible()

  await page.goto("/")
  await expect(page.getByText("3 / 5")).toBeVisible()
  await expect(page.getByText("复习导数")).toHaveCount(0)
})

test("plans support semester and winter-break workflows with overlap validation and task copy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/plans?view=period&date=${fixedToday}`)
  await expect(page.getByRole("heading", { name: "学习计划" })).toBeVisible()

  await createPeriod(page, {
    kind: "semester",
    name: "2026 秋季学期",
    startDate: semesterStart,
    endDate: semesterEnd,
    goal: "完成微积分基础",
  })
  await expect(page.getByRole("dialog", { name: "新建学期或假期" })).toBeHidden()

  await page.goto(`/plans?view=day&date=2027-01-10`)
  await createTask(page, { title: "整理线代错题", scheduledDate: "2027-01-10" })
  await page.goto(`/plans?view=day&date=2027-01-16`)
  await createTask(page, { title: "完成英语精读", scheduledDate: "2027-01-16" })

  await page.goto(`/plans?view=period&date=2027-01-16`)
  const invalidWinter = await createPeriod(page, {
    kind: "winter-break",
    name: "2027 寒假",
    startDate: overlappingWinterStart,
    endDate: winterEnd,
  })
  await expect(invalidWinter.getByRole("alert")).toContainText("学期与假期不能重叠")
  await expect(invalidWinter.getByRole("alert")).toContainText("2026 秋季学期")
  await invalidWinter.getByLabel("开始日期").fill(winterStart)
  await invalidWinter.getByRole("button", { name: "保存" }).click()
  await expect(invalidWinter).toBeHidden()

  await page.goto(`/plans?view=day&date=${winterStart}`)
  await createTask(page, { title: "寒假刷题", scheduledDate: winterStart })

  await expect(page.getByRole("button", { name: "打开任务操作：寒假刷题" })).toBeVisible()
  await viewButton(page, "周").click()
  await expect(page.getByRole("button", { name: "打开任务操作：寒假刷题" })).toBeVisible()
  await viewButton(page, "月").click()
  await expect(page.getByRole("button", { name: "打开任务操作：寒假刷题" })).toBeVisible()

  await page.goto(`/plans?view=period&date=${winterStart}`)
  await page.getByRole("button", { name: /2027 寒假.*2027-01-17.*2027-02-21/ }).click()
  await expect(page.getByRole("button", { name: "编辑任务：寒假刷题" })).toBeVisible()
  await expect(page.getByText("上一学期或假期还有 2 个任务未完成")).toBeVisible()

  await page.getByRole("button", { name: "查看并复制" }).click()
  await expect(page.getByLabel("上学期任务迁移")).toBeVisible()
  await page.getByLabel("选择整理线代错题").check()
  await page.getByLabel("选择完成英语精读").check()
  await page.getByRole("button", { name: "复制 2 项任务" }).click()
  await expect(page.getByLabel("上学期任务迁移")).toBeHidden()

  await page.goto(`/plans?view=day&date=${winterStart}`)
  await expect(page.getByRole("button", { name: "打开任务操作：寒假刷题" })).toBeVisible()
  await expect(page.getByRole("button", { name: "打开任务操作：整理线代错题" })).toBeVisible()
  await expect(page.getByRole("button", { name: "打开任务操作：完成英语精读" })).toBeVisible()

  await page.goto(`/plans?view=period&date=2027-01-16`)
  await page.getByRole("button", { name: /2026 秋季学期.*2026-09-01.*2027-01-16/ }).click()
  await expect(page.getByRole("button", { name: "编辑任务：整理线代错题" })).toBeVisible()
  await expect(page.getByRole("button", { name: "编辑任务：完成英语精读" })).toBeVisible()
})

test("plans stay responsive across milestone widths with semantic colors and unclipped controls", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await waitForPlanSeed(page)
    await expectNoHorizontalOverflow(page)

    const taskBar = page.getByRole("button", { name: "打开任务操作：高等数学 · 导数复习" })
    const taskBarBox = await readBox(taskBar)
    const laneBox = await readBox(page.getByLabel("待安排任务"))
    expect(taskBarBox.width).toBeGreaterThanOrEqual(laneBox.width - 40)
    expect(taskBarBox.height).toBeGreaterThanOrEqual(52)
    expect(taskBarBox.height).toBeLessThanOrEqual(56)

    for (const target of [
      page.getByRole("link", { name: "新建任务" }),
      viewButton(page, "日"),
      viewButton(page, "周"),
      viewButton(page, "月"),
      viewButton(page, "学期"),
    ]) {
      const box = await readBox(target)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }

    await page.getByRole("link", { name: "新建任务" }).click()
    const dialog = page.getByRole("dialog", { name: "新建学习任务" })
    const dialogBox = await readBox(dialog)
    if (width < 768) {
      expect(dialogBox.y + dialogBox.height).toBeGreaterThanOrEqual(896)
      expect(dialogBox.x).toBeLessThanOrEqual(1)
      expect(Math.abs(dialogBox.width - width)).toBeLessThanOrEqual(2)
    } else {
      expect(dialogBox.x).toBeGreaterThanOrEqual(width - 380)
      expect(dialogBox.height).toBeGreaterThanOrEqual(880)
    }
    await dialog.getByRole("button", { name: "关闭任务编辑" }).click()
    await expect(dialog).toBeHidden()

    const baselineTaskTypography = await taskBar.evaluate((element) => {
      const title = element.querySelector<HTMLElement>("span[class*='taskTitle']")
      const meta = element.querySelector<HTMLElement>("span[class*='taskMeta']")
      return {
        titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
        metaFontSize: meta ? Number.parseFloat(getComputedStyle(meta).fontSize) : 0,
      }
    })
    await page.getByRole("link", { name: "新建任务" }).click()
    const baselineDialogTypography = await dialog.evaluate((element) => {
      const heading = element.querySelector<HTMLElement>("h2")
      const fieldLabel = element.querySelector<HTMLElement>("label span")
      const primaryButton = element.querySelector<HTMLElement>("button[type='submit']")
      return {
        eyebrowFontSize: element.querySelector<HTMLElement>("p[class*='eyebrow']") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("p[class*='eyebrow']")!).fontSize) : 0,
        headingFontSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
        fieldLabelFontSize: fieldLabel ? Number.parseFloat(getComputedStyle(fieldLabel).fontSize) : 0,
        titleInputFontSize: element.querySelector<HTMLElement>("#task-title") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-title")!).fontSize) : 0,
        dateInputFontSize: element.querySelector<HTMLElement>("#task-date") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-date")!).fontSize) : 0,
        notesInputFontSize: element.querySelector<HTMLElement>("#task-notes") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-notes")!).fontSize) : 0,
        primaryButtonFontSize: primaryButton ? Number.parseFloat(getComputedStyle(primaryButton).fontSize) : 0,
      }
    })
    await dialog.getByRole("button", { name: "关闭任务编辑" }).click()
    await expect(dialog).toBeHidden()

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%"
    })
    await expectNoHorizontalOverflow(page)
    const zoomedTaskBar = await readBox(page.getByRole("button", { name: "打开任务操作：高等数学 · 导数复习" }))
    expect(zoomedTaskBar.height).toBeGreaterThanOrEqual(54)
    const textState = await page.getByRole("button", { name: "打开任务操作：高等数学 · 导数复习" }).evaluate((element) => {
      const title = element.querySelector<HTMLElement>("span[class*='taskTitle']")
      const trailing = element.querySelector<HTMLElement>("span[class*='trailing']")
      return {
        hasVerticalClip: element.scrollHeight > element.clientHeight,
        hasHorizontalClip: element.scrollWidth > element.clientWidth + 1,
        overlap: title && trailing ? title.getBoundingClientRect().right > trailing.getBoundingClientRect().left : false,
      }
    })
    expect(textState.hasVerticalClip).toBe(false)
    expect(textState.hasHorizontalClip).toBe(false)
    expect(textState.overlap).toBe(false)

    const zoomedTaskTypography = await taskBar.evaluate((element) => {
      const title = element.querySelector<HTMLElement>("span[class*='taskTitle']")
      const meta = element.querySelector<HTMLElement>("span[class*='taskMeta']")
      return {
        titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
        metaFontSize: meta ? Number.parseFloat(getComputedStyle(meta).fontSize) : 0,
      }
    })
    expect(zoomedTaskTypography.titleFontSize).toBeGreaterThanOrEqual(baselineTaskTypography.titleFontSize * 1.95)
    expect(zoomedTaskTypography.titleFontSize).toBeLessThanOrEqual(baselineTaskTypography.titleFontSize * 2.05)
    expect(zoomedTaskTypography.metaFontSize).toBeGreaterThanOrEqual(baselineTaskTypography.metaFontSize * 1.95)
    expect(zoomedTaskTypography.metaFontSize).toBeLessThanOrEqual(baselineTaskTypography.metaFontSize * 2.05)

    await page.getByRole("link", { name: "新建任务" }).click()
    const zoomedDialogTypography = await dialog.evaluate((element) => {
      const heading = element.querySelector<HTMLElement>("h2")
      const fieldLabel = element.querySelector<HTMLElement>("label span")
      const primaryButton = element.querySelector<HTMLElement>("button[type='submit']")
      return {
        eyebrowFontSize: element.querySelector<HTMLElement>("p[class*='eyebrow']") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("p[class*='eyebrow']")!).fontSize) : 0,
        headingFontSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
        fieldLabelFontSize: fieldLabel ? Number.parseFloat(getComputedStyle(fieldLabel).fontSize) : 0,
        titleInputFontSize: element.querySelector<HTMLElement>("#task-title") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-title")!).fontSize) : 0,
        dateInputFontSize: element.querySelector<HTMLElement>("#task-date") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-date")!).fontSize) : 0,
        notesInputFontSize: element.querySelector<HTMLElement>("#task-notes") ? Number.parseFloat(getComputedStyle(element.querySelector<HTMLElement>("#task-notes")!).fontSize) : 0,
        primaryButtonFontSize: primaryButton ? Number.parseFloat(getComputedStyle(primaryButton).fontSize) : 0,
        hasHorizontalClip: element.scrollWidth > element.clientWidth + 1,
      }
    })
    expect(zoomedDialogTypography.headingFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.headingFontSize * 1.95)
    expect(zoomedDialogTypography.headingFontSize).toBeLessThanOrEqual(baselineDialogTypography.headingFontSize * 2.05)
    expect(zoomedDialogTypography.eyebrowFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.eyebrowFontSize * 1.95)
    expect(zoomedDialogTypography.eyebrowFontSize).toBeLessThanOrEqual(baselineDialogTypography.eyebrowFontSize * 2.05)
    expect(zoomedDialogTypography.fieldLabelFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.fieldLabelFontSize * 1.95)
    expect(zoomedDialogTypography.fieldLabelFontSize).toBeLessThanOrEqual(baselineDialogTypography.fieldLabelFontSize * 2.05)
    expect(zoomedDialogTypography.titleInputFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.titleInputFontSize * 1.95)
    expect(zoomedDialogTypography.titleInputFontSize).toBeLessThanOrEqual(baselineDialogTypography.titleInputFontSize * 2.05)
    expect(zoomedDialogTypography.dateInputFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.dateInputFontSize * 1.95)
    expect(zoomedDialogTypography.dateInputFontSize).toBeLessThanOrEqual(baselineDialogTypography.dateInputFontSize * 2.05)
    expect(zoomedDialogTypography.notesInputFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.notesInputFontSize * 1.95)
    expect(zoomedDialogTypography.notesInputFontSize).toBeLessThanOrEqual(baselineDialogTypography.notesInputFontSize * 2.05)
    expect(zoomedDialogTypography.primaryButtonFontSize).toBeGreaterThanOrEqual(baselineDialogTypography.primaryButtonFontSize * 1.95)
    expect(zoomedDialogTypography.primaryButtonFontSize).toBeLessThanOrEqual(baselineDialogTypography.primaryButtonFontSize * 2.05)
    expect(zoomedDialogTypography.hasHorizontalClip).toBe(false)
    await dialog.getByRole("button", { name: "关闭任务编辑" }).click()
    await expect(dialog).toBeHidden()

    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const primaryAction = document.querySelector<HTMLElement>("a[href*='new=1']")
      const dateControl = document.querySelector<HTMLElement>("label[class*='dateControl']")
      const taskBar = document.querySelector<HTMLElement>("button[class*='taskBar']")
      const viewSurface = document.querySelector<HTMLElement>("section[class*='viewSurface']")
      return {
        brand: root.getPropertyValue("--color-brand").trim(),
        coolBlue: root.getPropertyValue("--color-cool-blue-soft").trim(),
        teal: root.getPropertyValue("--color-teal").trim(),
        primaryBackground: primaryAction ? getComputedStyle(primaryAction).backgroundColor : "",
        dateControlBackground: dateControl ? getComputedStyle(dateControl).backgroundColor : "",
        taskBarBackground: taskBar ? getComputedStyle(taskBar).backgroundColor : "",
        surfaceBackground: viewSurface ? getComputedStyle(viewSurface).backgroundColor : "",
      }
    })
    expect(colors.brand).toBe("#901d78")
    expect(colors.coolBlue).toBe("#dce5f6")
    expect(colors.teal).toBe("#2d8f83")
    expect(colors.primaryBackground).toBe("rgb(144, 29, 120)")
    expect(colors.dateControlBackground).toBe("rgb(220, 229, 246)")
    expect(colors.taskBarBackground).not.toBe("rgb(144, 29, 120)")
    expect(colors.taskBarBackground).not.toBe(colors.surfaceBackground)
  }
})

test("long task titles stay ellipsized at normal and 200% text size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForPlanSeed(page)
  const title = "这是一个需要在狭窄屏幕上保持单行省略显示的超长学习任务标题，不能撑破任务条"
  await createTask(page, { title, scheduledDate: fixedToday })

  const taskBar = page.getByRole("button", { name: `打开任务操作：${title}` })
  await expect(taskBar).toHaveCount(1)
  const normalBarBox = await readBox(taskBar)
  expect(normalBarBox.height).toBeGreaterThanOrEqual(52)
  expect(normalBarBox.height).toBeLessThanOrEqual(56)
  const normalTextState = await taskBar.evaluate((element) => {
    const titleElement = element.querySelector<HTMLElement>("span[class*='taskTitle']")
    const trailing = element.querySelector<HTMLElement>("span[class*='trailing']")
    if (!titleElement || !trailing) throw new Error("Task title or trailing metadata missing")
    const style = getComputedStyle(titleElement)
    return {
      display: style.display,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      titleOverflowed: titleElement.scrollWidth > titleElement.clientWidth + 1,
      barOverflowed: element.scrollWidth > element.clientWidth + 1,
      verticallyClipped: element.scrollHeight > element.clientHeight + 1,
      overlaps: titleElement.getBoundingClientRect().right > trailing.getBoundingClientRect().left,
    }
  })
  expect(normalTextState.display).toBe("block")
  expect(normalTextState.overflow).toBe("hidden")
  expect(normalTextState.textOverflow).toBe("ellipsis")
  expect(normalTextState.whiteSpace).toBe("nowrap")
  expect(normalTextState.titleOverflowed).toBe(true)
  expect(normalTextState.barOverflowed).toBe(false)
  expect(normalTextState.verticallyClipped).toBe(false)
  expect(normalTextState.overlaps).toBe(false)

  const normalFontSize = await taskBar.locator("span[class*='taskTitle']").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%"
  })
  await expectNoHorizontalOverflow(page)
  const zoomedBarBox = await readBox(taskBar)
  expect(zoomedBarBox.height).toBeGreaterThanOrEqual(normalBarBox.height)
  const zoomedTextState = await taskBar.evaluate((element) => {
    const titleElement = element.querySelector<HTMLElement>("span[class*='taskTitle']")
    const trailing = element.querySelector<HTMLElement>("span[class*='trailing']")
    if (!titleElement || !trailing) throw new Error("Task title or trailing metadata missing")
    return {
      fontSize: Number.parseFloat(getComputedStyle(titleElement).fontSize),
      whiteSpace: getComputedStyle(titleElement).whiteSpace,
      titleOverflowed: titleElement.scrollWidth > titleElement.clientWidth + 1,
      barOverflowed: element.scrollWidth > element.clientWidth + 1,
      verticallyClipped: element.scrollHeight > element.clientHeight + 1,
      overlaps: titleElement.getBoundingClientRect().right > trailing.getBoundingClientRect().left,
    }
  })
  expect(zoomedTextState.fontSize).toBeGreaterThanOrEqual(normalFontSize * 1.95)
  expect(zoomedTextState.fontSize).toBeLessThanOrEqual(normalFontSize * 2.05)
  expect(zoomedTextState.whiteSpace).toBe("nowrap")
  expect(zoomedTextState.titleOverflowed).toBe(true)
  expect(zoomedTextState.barOverflowed).toBe(false)
  expect(zoomedTextState.verticallyClipped).toBe(false)
  expect(zoomedTextState.overlaps).toBe(false)
})

test("month workspace and range-plan drawer adapt across phone and tablet layouts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForPlanSeed(page)
  await page.goto(`/plans?view=month&date=${fixedToday}`)

  await page.getByRole("button", { name: "制定本月计划" }).click()
  const mobileDrawer = page.getByRole("dialog", { name: "制定本月计划" })
  await expect(mobileDrawer).toBeVisible()
  const mobileDrawerBox = await readBox(mobileDrawer)
  expect(Math.abs(mobileDrawerBox.width - 390)).toBeLessThanOrEqual(2)
  expect(mobileDrawerBox.y + mobileDrawerBox.height).toBeGreaterThanOrEqual(840)
  await mobileDrawer.getByLabel("计划主题").fill("九月线代冲刺")
  await mobileDrawer.getByLabel("总体目标").fill("完成矩阵与秩的复习")
  await mobileDrawer.getByLabel("重点事项 1").fill("矩阵乘法")
  await mobileDrawer.getByRole("button", { name: "保存本月计划" }).click()
  await expect(mobileDrawer).toBeHidden()
  await expect(page.getByText("九月线代冲刺")).toBeVisible()

  for (const width of widths) {
    const height = width < 768 ? 900 : width < 1024 ? 1112 : 900
    await page.setViewportSize({ width, height })
    await page.goto(`/plans?view=month&date=${fixedToday}`)
    await expectNoHorizontalOverflow(page)

    const calendarBox = await readBox(page.getByLabel("月度日历"))
    const taskPanelBox = await readBox(page.getByRole("region", { name: `${calendarDayLabel(fixedToday)}任务` }))
    if (width < 1024) {
      expect(taskPanelBox.y).toBeGreaterThan(calendarBox.y + calendarBox.height - 2)
    } else {
      expect(taskPanelBox.x).toBeGreaterThan(calendarBox.x + calendarBox.width - 2)
      expect(calendarBox.width).toBeGreaterThan(taskPanelBox.width * 1.45)
    }
  }

  await page.setViewportSize({ width: 834, height: 1112 })
  await page.goto(`/plans?view=month&date=${fixedToday}`)
  await page.getByRole("button", { name: "查看或编辑本月计划" }).click()
  const tabletDrawer = page.getByRole("dialog", { name: "编辑本月计划" })
  const tabletDrawerBox = await readBox(tabletDrawer)
  expect(tabletDrawerBox.x).toBeGreaterThanOrEqual(834 - 380)
  expect(tabletDrawerBox.height).toBeGreaterThanOrEqual(1100)
  const drawerAxe = await new AxeBuilder({ page }).include("dialog").analyze()
  expect(drawerAxe.violations).toEqual([])
  await tabletDrawer.getByRole("button", { name: "关闭总计划设置" }).click()
})

test("week and month calendars omit spanning bars while keeping multi-day steps readable", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 })
  await waitForPlanSeed(page)
  await page.goto(`/plans?view=day&date=${semesterStart}`)
  await createMultiDayTask(page, {
    title: "线性代数",
    subject: "线性代数",
    startDate: "2026-09-01",
    endDate: "2026-09-06",
    sessionCount: "3",
  })
  await page.goto(`/plans?view=week&date=${semesterStart}`)

  await expect(page.getByRole("group", { name: "选择周内日期" })).toBeVisible()
  await expect(page.getByLabel("本周排程")).toBeHidden()
  const portraitTasks = page.getByRole("region", { name: /2026年9月1日，星期二任务/ })
  await expect(portraitTasks).toBeVisible()
  await expect(portraitTasks.getByRole("button", { name: "打开任务操作：线性代数" })).toBeVisible()
  await expect(page.getByLabel("本周跨日任务")).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  await page.setViewportSize({ width: 1180, height: 820 })
  await page.goto(`/plans?view=week&date=${semesterStart}`)
  const schedule = page.getByLabel("本周排程")
  await expect(schedule).toBeVisible()
  await expect(page.getByRole("group", { name: "选择周内日期" })).toBeHidden()
  await expect(page.getByLabel("本周跨日任务")).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  const layout = await page.evaluate(() => {
    const weekGrid = document.querySelector<HTMLElement>("[aria-label='本周排程']")
    if (!weekGrid) throw new Error("Week grid is missing")
    const columns = [...weekGrid.querySelectorAll<HTMLElement>("section[data-drop-date]")]
    const taskBars = columns.flatMap((column) => [...column.querySelectorAll<HTMLElement>("button[class*='taskBar']")].map((taskBar) => {
      const columnBox = column.getBoundingClientRect()
      const taskBox = taskBar.getBoundingClientRect()
      return {
        leftInside: taskBox.left >= columnBox.left - 1,
        rightInside: taskBox.right <= columnBox.right + 1,
      }
    }))
    return {
      taskBars,
    }
  })

  expect(layout.taskBars.length).toBeGreaterThan(0)
  expect(layout.taskBars.every((taskBar) => taskBar.leftInside && taskBar.rightInside)).toBe(true)

  await page.goto(`/plans?view=month&date=${semesterStart}`)
  await expect(page.getByTestId("month-task-group-segment")).toHaveCount(0)
  await expect(page.getByRole("region", { name: "2026年9月1日任务" }).getByRole("button", { name: "打开任务操作：线性代数" })).toBeVisible()
})

test("plans remain accessible through day, month, editor, delete, migration, keyboard, focus, reduced motion, and backdrop flows", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 })
  await waitForPlanSeed(page)

  const dayAxe = await new AxeBuilder({ page }).include("main").analyze()
  expect(dayAxe.violations).toEqual([])

  const taskButton = page.getByRole("button", { name: "打开任务操作：高等数学 · 导数复习" })
  await taskButton.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "已完成：高等数学 · 导数复习" })).toBeVisible({ timeout: 100 })
  await expect(statusByText(page, "任务已完成")).toBeVisible()
  await page.getByRole("button", { name: "撤销" }).click()

  await viewButton(page, "月").click()
  const monthAxe = await new AxeBuilder({ page }).include("main").analyze()
  expect(monthAxe.violations).toEqual([])
  await viewButton(page, "日").click()

  await taskButton.click()
  const actionsDialog = page.getByRole("dialog", { name: "高等数学 · 导数复习" })
  await expect(actionsDialog).toBeVisible()
  await actionsDialog.getByRole("button", { name: "编辑" }).click()

  const editor = page.getByRole("dialog", { name: "编辑学习任务" })
  await expect(editor).toBeVisible()
  const editorAxe = await new AxeBuilder({ page }).include("dialog").analyze()
  expect(editorAxe.violations).toEqual([])

  await editor.getByLabel("任务标题").click()
  await expect(editor).toBeVisible()

  const editorBox = await readBox(editor)
  await page.mouse.click(editorBox.x - 20, editorBox.y + 20)
  await expect(editor).toBeHidden()
  await expect(taskButton).toBeFocused()

  await taskButton.click()
  await page.getByRole("button", { name: "删除" }).click()
  const deleteDialog = page.getByRole("dialog", { name: "确定删除“高等数学 · 导数复习”吗？" })
  await expect(deleteDialog).toBeVisible()
  const deleteAxe = await new AxeBuilder({ page }).include("dialog").analyze()
  expect(deleteAxe.violations).toEqual([])
  await deleteDialog.getByRole("button", { name: "取消" }).click()
  await expect(deleteDialog).toBeHidden()
  await expect(taskButton).toBeFocused()

  await page.goto(`/plans?view=period&date=2027-01-16`)
  await createPeriod(page, {
    kind: "semester",
    name: "2026 秋季学期",
    startDate: semesterStart,
    endDate: semesterEnd,
  })
  await page.goto(`/plans?view=day&date=2027-01-10`)
  await createTask(page, { title: "上一周期任务", scheduledDate: "2027-01-10" })
  await page.goto(`/plans?view=period&date=2027-01-16`)
  const winterDialog = await createPeriod(page, {
    kind: "winter-break",
    name: "2027 寒假",
    startDate: winterStart,
    endDate: winterEnd,
  })
  await expect(winterDialog).toBeHidden()
  await page.getByRole("button", { name: /2027 寒假.*2027-01-17.*2027-02-21/ }).click()
  await page.getByRole("button", { name: "查看并复制" }).click()
  const migrationPanel = page.getByLabel("上学期任务迁移")
  await expect(migrationPanel).toBeVisible()
  const migrationAxe = await new AxeBuilder({ page }).include("aside").analyze()
  expect(migrationAxe.violations).toEqual([])
  await migrationPanel.getByRole("button", { name: "暂不处理" }).click()
  await expect(migrationPanel).toBeHidden()

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  const reducedTask = page.getByRole("button", { name: "打开任务操作：物理实验报告 · 数据整理" })
  await reducedTask.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "已完成：物理实验报告 · 数据整理" })).toBeVisible({ timeout: 100 })
})

test("plans keep local task creation and completion after an offline reload", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForPlanSeed(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  await context.setOffline(true)
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(page.getByRole("heading", { name: "学习计划" })).toBeVisible()
  await createTask(page, { title: "离线学习任务", scheduledDate: fixedToday })
  await expect(page.getByRole("button", { name: "打开任务操作：离线学习任务" })).toBeVisible()

  const offlineTask = page.getByRole("button", { name: "打开任务操作：离线学习任务" })
  await offlineTask.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "已完成：离线学习任务" })).toBeVisible()
  await expect(page.getByText("4 / 6")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "已完成：离线学习任务" })).toBeVisible()
  await expect(page.locator("[data-app-name='Velow Notebook']")).toBeVisible()
})
