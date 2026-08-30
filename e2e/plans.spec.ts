import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"

const fixedToday = "2026-08-30"
const fixedTomorrow = "2026-08-31"
const semesterStart = "2026-09-01"
const semesterEnd = "2027-01-16"
const overlappingWinterStart = "2027-01-10"
const winterStart = "2027-01-17"
const winterEnd = "2027-02-21"
const widths = [375, 390, 768, 834, 1024, 1440]
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

function viewButton(page: Page, name: "日" | "周" | "月" | "周期") {
  return page.getByRole("group", { name: "计划视图" }).getByRole("button", { name, exact: true })
}

function statusByText(page: Page, text: string) {
  return page.getByRole("status").filter({ hasText: text })
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

async function createPeriod(page: Page, input: {
  kind: "semester" | "winter-break"
  name: string
  startDate: string
  endDate: string
  goal?: string
}) {
  const trigger = page.getByRole("button", { name: "创建第一个学期或假期" }).or(page.getByRole("button", { name: "新建周期" }))
  await trigger.click()

  const dialog = page.getByRole("dialog", { name: "新建学习周期" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("周期类型").selectOption(input.kind)
  await dialog.getByLabel("周期名称").fill(input.name)
  await dialog.getByLabel("开始日期").fill(input.startDate)
  await dialog.getByLabel("结束日期").fill(input.endDate)
  if (input.goal) await dialog.getByLabel("学习目标").fill(input.goal)
  await dialog.getByRole("button", { name: "保存周期" }).click()
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

async function longPressDragToDate(page: Page, taskTitle: string, targetDate: string) {
  const task = page.getByRole("button", { name: `打开任务操作：${taskTitle}` })
  const taskBox = await task.boundingBox()
  if (!taskBox) throw new Error(`Task bar bounds missing for ${taskTitle}`)

  const dropTarget = page.locator(`[data-drop-date="${targetDate}"]`).first()
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
  await longPressDragToDate(page, "复习导数", fixedTomorrow)
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
  await expect(page.getByRole("dialog", { name: "新建学习周期" })).toBeHidden()

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
  await expect(invalidWinter.getByRole("alert")).toContainText("学习周期不能重叠")
  await expect(invalidWinter.getByRole("alert")).toContainText("2026 秋季学期")
  await invalidWinter.getByLabel("开始日期").fill(winterStart)
  await invalidWinter.getByRole("button", { name: "保存周期" }).click()
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
  await expect(page.getByText("上一学习周期还有 2 个任务未完成")).toBeVisible()

  await page.getByRole("button", { name: "查看并复制" }).click()
  await expect(page.getByLabel("上周期任务迁移")).toBeVisible()
  await page.getByLabel("选择整理线代错题").check()
  await page.getByLabel("选择完成英语精读").check()
  await page.getByRole("button", { name: "复制 2 项任务" }).click()
  await expect(page.getByLabel("上周期任务迁移")).toBeHidden()

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
      viewButton(page, "周期"),
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
        titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : false,
        overlap: title && trailing ? title.getBoundingClientRect().right > trailing.getBoundingClientRect().left : false,
      }
    })
    expect(textState.hasVerticalClip).toBe(false)
    expect(textState.overlap).toBe(false)

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
  const migrationPanel = page.getByLabel("上周期任务迁移")
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
