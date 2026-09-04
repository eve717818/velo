import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import type { PlanTask } from "../src/db/types"

const fixedToday = "2026-08-30"
const semesterStart = "2026-09-01"
const semesterEnd = "2027-01-16"
const viewportMatrix = [
  { width: 375, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
  { width: 1024, height: 820 },
  { width: 1366, height: 900 },
  { width: 1440, height: 900 },
] as const

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
          super(args[0])
          return
        }
        if (args.length === 2) {
          super(args[0], args[1])
          return
        }
        if (args.length === 3) {
          super(args[0], args[1], args[2])
          return
        }
        if (args.length === 4) {
          super(args[0], args[1], args[2], args[3])
          return
        }
        if (args.length === 5) {
          super(args[0], args[1], args[2], args[3], args[4])
          return
        }
        if (args.length === 6) {
          super(args[0], args[1], args[2], args[3], args[4], args[5])
          return
        }
        super(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
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

test.setTimeout(120_000)

function taskButton(page: Page, title: string, completed = false) {
  return page.getByRole("button", { name: `${completed ? "已完成" : "打开任务操作"}：${title}` })
}

function viewButton(page: Page, name: "日" | "周" | "月" | "学期") {
  return page.getByRole("group", { name: "计划视图" }).getByRole("button", { name, exact: true })
}

function progressPanel(page: Page) {
  return page.getByRole("region", { name: "完成进度" })
}

async function waitForPlanSeed(page: Page) {
  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await expect(page.getByRole("heading", { name: "学习计划" })).toBeVisible()
  await expect(taskButton(page, "高等数学 · 导数复习")).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

async function readBox(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Expected a visible element")
  return box
}

async function expectCardsInsideSurface(page: Page) {
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false")
  for (const task of await page.locator("button[class*='taskBar']").all()) {
    const surfaceBox = await readBox(task.locator("xpath=ancestor::section[1]"))
    const box = await readBox(task)
    expect(box.x).toBeGreaterThanOrEqual(surfaceBox.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(surfaceBox.x + surfaceBox.width + 1)
  }
}

async function storedTasks(page: Page): Promise<PlanTask[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("velo")
    request.onerror = () => reject(new Error(request.error?.message ?? "Cannot open task database"))
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction("planTasks", "readonly")
      const rows = transaction.objectStore("planTasks").getAll()
      rows.onerror = () => reject(new Error(rows.error?.message ?? "Cannot read stored tasks"))
      rows.onsuccess = () => resolve(rows.result as PlanTask[])
      transaction.oncomplete = () => db.close()
    }
  }))
}

async function expectLargeTargets(controls: Locator) {
  for (const control of await controls.all()) {
    const box = await readBox(control)
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
}

async function createTask(page: Page, input: {
  title: string
  scope: "day" | "week" | "month" | "semester"
  periodValue?: string
  subject?: string
  estimatedMinutes?: string
  notes?: string
  startTime?: string
}) {
  await page.getByRole("link", { name: "新建任务" }).or(page.getByRole("button", { name: "新建任务" })).first().click()

  const dialog = page.getByRole("dialog", { name: "新建学习任务" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("任务标题").fill(input.title)
  if (input.scope === "day" && input.periodValue) await dialog.getByLabel("日期").fill(input.periodValue)
  if (input.scope === "week" && input.periodValue) await dialog.getByLabel("所属周").fill(input.periodValue)
  if (input.scope === "month" && input.periodValue) await dialog.getByLabel("所属月").fill(input.periodValue)
  if (input.scope === "semester" && input.periodValue) await dialog.getByLabel("所属学期或假期").selectOption(input.periodValue)
  if (input.subject) await dialog.getByLabel("科目").fill(input.subject)
  if (input.estimatedMinutes) await dialog.getByLabel("预计时长（分钟）").fill(input.estimatedMinutes)
  if (input.notes) await dialog.getByLabel("备注").fill(input.notes)
  if (input.startTime) await dialog.getByLabel("开始时间").fill(input.startTime)
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
  const createTrigger = page.getByRole("button", { name: "创建第一个学期或假期" }).or(page.getByRole("button", { name: "新建学期或假期" })).first()
  if (await createTrigger.count() === 0) {
    await page.getByRole("button", { name: "管理学期与假期" }).click()
  }
  await createTrigger.click()

  const dialog = page.getByRole("dialog", { name: "新建学期或假期" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("学期或假期类型").selectOption(input.kind)
  await dialog.getByLabel("学期或假期名称").fill(input.name)
  await dialog.getByLabel("开始日期").fill(input.startDate)
  await dialog.getByLabel("结束日期").fill(input.endDate)
  if (input.goal) await dialog.getByLabel("学习目标").fill(input.goal)
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toBeHidden()
}

async function swipeToComplete(page: Page, title: string) {
  const task = taskButton(page, title)
  await task.scrollIntoViewIfNeeded()
  await task.hover()
  const box = await task.boundingBox()
  if (!box) throw new Error(`Task bar bounds missing for ${title}`)

  await page.mouse.move(box.x + 14, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 14, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
}

async function undoCompletion(page: Page, title: string) {
  await page.getByRole("button", { name: "撤销" }).click()
  await expect(taskButton(page, title)).toBeVisible()
}

async function expectOnlyVisibleInOwnScope(page: Page, title: string, scope: "day" | "week" | "month" | "semester", periodId: string) {
  const routes = {
    day: `/plans?view=day&date=${fixedToday}`,
    week: `/plans?view=week&date=${fixedToday}`,
    month: `/plans?view=month&date=${fixedToday}`,
    semester: `/plans?view=period&date=${semesterStart}&period=${periodId}`,
  }
  for (const [candidate, route] of Object.entries(routes)) {
    await page.goto(route)
    await expect(page.locator("main")).toHaveAttribute("aria-busy", "false")
    await expect(taskButton(page, title)).toHaveCount(candidate === scope ? 1 : 0)
  }
}

async function forceNextTaskWriteFailure(page: Page, method: "add" | "put" = "add") {
  await page.evaluate((method) => {
    const objectStorePrototype = IDBObjectStore.prototype
    const originalAdd = Object.getOwnPropertyDescriptor(objectStorePrototype, method)!.value as IDBObjectStore["add"]
    let shouldFail = true
    objectStorePrototype[method] = function add(value: unknown, key?: IDBValidKey) {
      if (shouldFail && this.name === "planTasks") {
        shouldFail = false
        objectStorePrototype[method] = originalAdd
        throw new DOMException("模拟写入失败", "AbortError")
      }
      return originalAdd.call(this, value, key)
    }
  }, method)
}

test("independent plan workspaces stay responsive, isolated, recoverable, accessible, and offline-ready", async ({ context, page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForPlanSeed(page)

  await createTask(page, { title: "日计划独立任务", scope: "day", periodValue: fixedToday, subject: "数学", estimatedMinutes: "45", startTime: "09:30" })
  await viewButton(page, "周").click()
  await createTask(page, { title: "周计划独立任务", scope: "week", periodValue: "2026-W35", subject: "英语" })
  await viewButton(page, "月").click()
  await createTask(page, { title: "月计划独立任务", scope: "month", periodValue: "2026-08", subject: "物理" })
  await viewButton(page, "学期").click()
  await createPeriod(page, {
    kind: "semester",
    name: "2026 秋季学期",
    startDate: semesterStart,
    endDate: semesterEnd,
  })
  await page.getByRole("button", { name: /学期 2026 秋季学期 2026-09-01 至 2027-01-16/ }).click()
  const periodValue = await page.getByLabel("选择学期或假期").inputValue()
  await createTask(page, { title: "学期计划独立任务", scope: "semester", periodValue, subject: "线代", notes: "只属于这个学期" })

  await expectOnlyVisibleInOwnScope(page, "日计划独立任务", "day", periodValue)
  await expectOnlyVisibleInOwnScope(page, "周计划独立任务", "week", periodValue)
  await expectOnlyVisibleInOwnScope(page, "月计划独立任务", "month", periodValue)
  await expectOnlyVisibleInOwnScope(page, "学期计划独立任务", "semester", periodValue)

  for (const view of ["week", "month"] as const) {
    await page.goto(`/plans?view=${view}&date=${fixedToday}`)
    await expect(page.locator("main")).toHaveAttribute("aria-busy", "false")
    await expect(page.getByRole("grid")).toHaveCount(0)
    await expect(page.locator("[class*='weekGrid'], [class*='monthGrid'], [class*='weekDateStrip'], [class*='monthWeekDays']")).toHaveCount(0)
  }

  await page.goto(`/plans?view=period&date=${semesterStart}&period=${periodValue}`)
  await expect(taskButton(page, "学期计划独立任务")).toBeVisible()
  await expect(page.getByLabel("本学期任务")).toHaveAttribute("data-period-key", periodValue)
  expect((await storedTasks(page)).find((task) => task.title === "学期计划独立任务")).toMatchObject({ scope: "semester", periodKey: periodValue })

  for (const item of [
    { route: `/plans?view=day&date=${fixedToday}`, title: "日计划独立任务", before: "3 / 6", after: "4 / 6" },
    { route: `/plans?view=week&date=${fixedToday}`, title: "周计划独立任务", before: "0 / 1", after: "1 / 1" },
    { route: `/plans?view=month&date=${fixedToday}`, title: "月计划独立任务", before: "0 / 1", after: "1 / 1" },
    { route: `/plans?view=period&date=${semesterStart}&period=${periodValue}`, title: "学期计划独立任务", before: "0 / 1", after: "1 / 1" },
  ]) {
    await page.goto(item.route)
    await expect(progressPanel(page)).toContainText(item.before)
    const beforeTasks = await storedTasks(page)
    const taskId = beforeTasks.find((task) => task.title === item.title)!.id
    await swipeToComplete(page, item.title)
    await expect(taskButton(page, item.title, true)).toBeVisible()
    await expect(progressPanel(page)).toContainText(item.after)
    const afterTasks = await storedTasks(page)
    expect(afterTasks.filter((task) => task.id !== taskId)).toEqual(beforeTasks.filter((task) => task.id !== taskId))
    await undoCompletion(page, item.title)
    await expect(progressPanel(page)).toContainText(item.before)
    expect((await storedTasks(page)).find((task) => task.id === taskId)).toMatchObject({ id: taskId, isCompleted: 0 })
  }

  await page.goto(`/plans?view=day&date=${fixedToday}`)
  await swipeToComplete(page, "日计划独立任务")
  await page.goto(`/plans?view=week&date=${fixedToday}`)
  await expect(progressPanel(page)).toContainText("0 / 1")

  const beforeInvalid = await storedTasks(page)
  await page.goto(`/plans?view=period&date=${semesterStart}&period=missing-period&new=1`)
  await expect(page.getByRole("heading", { name: "选择一个学期或假期" })).toBeVisible()
  await expect(page.getByRole("link", { name: "新建任务" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "新建任务" })).toHaveCount(0)
  await expect(page.getByRole("dialog", { name: "新建学习任务" })).toBeHidden()
  expect(await storedTasks(page)).toEqual(beforeInvalid)
  await page.screenshot({ path: testInfo.outputPath("invalid-semester.png"), fullPage: true })

  await page.goto(`/plans?view=period&date=${semesterStart}&period=${periodValue}`)
  const createTrigger = page.getByRole("link", { name: "新建任务" })
  await createTrigger.focus()
  await forceNextTaskWriteFailure(page)
  await createTrigger.click()
  const failedDialog = page.getByRole("dialog", { name: "新建学习任务" })
  await failedDialog.getByLabel("任务标题").fill("失败后保留的任务")
  await failedDialog.getByLabel("科目").fill("化学")
  await failedDialog.getByLabel("预计时长（分钟）").fill("35")
  await failedDialog.getByLabel("备注").fill("表单不能丢")
  await failedDialog.getByRole("button", { name: "保存任务" }).click()
  await expect(failedDialog.getByRole("alert")).toContainText("模拟写入失败")
  await expect(failedDialog.getByLabel("任务标题")).toHaveValue("失败后保留的任务")
  await expect(failedDialog.getByLabel("科目")).toHaveValue("化学")
  await expect(failedDialog.getByLabel("预计时长（分钟）")).toHaveValue("35")
  await expect(failedDialog.getByLabel("备注")).toHaveValue("表单不能丢")
  await expect(failedDialog.getByLabel("所属学期或假期")).toHaveValue(periodValue)
  const errorBox = await readBox(failedDialog.getByRole("alert"))
  const cancelBox = await readBox(failedDialog.getByRole("button", { name: "取消" }))
  const saveBox = await readBox(failedDialog.getByRole("button", { name: "保存任务" }))
  expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(cancelBox.y)
  expect(cancelBox.y).toBe(saveBox.y)
  expect(cancelBox.height).toBe(saveBox.height)
  expect(cancelBox.height).toBeGreaterThanOrEqual(44)
  expect((await storedTasks(page)).find((task) => task.title === "失败后保留的任务")).toBeUndefined()
  await page.screenshot({ path: testInfo.outputPath("failed-save.png"), fullPage: true })
  await failedDialog.getByRole("button", { name: "重试" }).click()
  await expect(failedDialog).toBeHidden()
  await expect(createTrigger).toBeFocused()
  await expect(taskButton(page, "失败后保留的任务")).toBeVisible()

  await taskButton(page, "失败后保留的任务").click()
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  const editDialog = page.getByRole("dialog", { name: "编辑学习任务" })
  await editDialog.getByLabel("任务标题").fill("失败后保留的任务已编辑")
  await editDialog.getByLabel("科目").fill("生物")
  await editDialog.getByLabel("预计时长（分钟）").fill("55")
  await editDialog.getByLabel("备注").fill("编辑失败后仍完整保留")
  await forceNextTaskWriteFailure(page, "put")
  await editDialog.getByRole("button", { name: "保存任务" }).click()
  await expect(editDialog.getByRole("alert")).toContainText("模拟写入失败")
  await expect(editDialog.getByLabel("任务标题")).toHaveValue("失败后保留的任务已编辑")
  await expect(editDialog.getByLabel("科目")).toHaveValue("生物")
  await expect(editDialog.getByLabel("预计时长（分钟）")).toHaveValue("55")
  await expect(editDialog.getByLabel("备注")).toHaveValue("编辑失败后仍完整保留")
  await expect(editDialog.getByLabel("所属学期或假期")).toHaveValue(periodValue)
  await editDialog.getByRole("button", { name: "重试" }).click()
  await expect(editDialog).toBeHidden()
  await expect(taskButton(page, "失败后保留的任务已编辑")).toBeFocused()

  await page.goto(`/plans?view=week&date=${fixedToday}`)
  const keyboardTask = taskButton(page, "周计划独立任务")
  await keyboardTask.focus()
  await page.keyboard.press("Enter")
  await expect(taskButton(page, "周计划独立任务", true)).toBeVisible()
  await undoCompletion(page, "周计划独立任务")
  await keyboardTask.focus()
  await page.keyboard.press("Space")
  await expect(taskButton(page, "周计划独立任务", true)).toBeVisible()
  await undoCompletion(page, "周计划独立任务")

  await taskButton(page, "周计划独立任务").click()
  const actionsDialog = page.getByRole("dialog", { name: "周计划独立任务" })
  await expect(actionsDialog).toBeVisible()
  await actionsDialog.getByRole("button", { name: "标记为完成" }).click()
  await expect(actionsDialog).toBeHidden()
  await expect(taskButton(page, "周计划独立任务", true)).toBeVisible()
  await expect(taskButton(page, "周计划独立任务", true)).toBeFocused()

  await page.reload()
  await expect(taskButton(page, "周计划独立任务", true)).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(taskButton(page, "周计划独立任务", true)).toBeVisible()
  await createTask(page, { title: "离线新建周任务", scope: "week", subject: "历史" })
  await swipeToComplete(page, "离线新建周任务")
  await expect(page.getByRole("status")).toContainText("任务已完成")
  await expect(progressPanel(page)).toContainText("2 / 2")
  await page.reload()
  await expect(taskButton(page, "离线新建周任务", true)).toBeVisible()
  for (const item of [
    { route: `/plans?view=day&date=${fixedToday}`, title: "日计划独立任务", completed: true },
    { route: `/plans?view=month&date=${fixedToday}`, title: "月计划独立任务", completed: false },
    { route: `/plans?view=period&date=${semesterStart}&period=${periodValue}`, title: "学期计划独立任务", completed: false },
  ]) {
    await page.goto(item.route)
    await page.reload()
    await expect(taskButton(page, item.title, item.completed)).toBeVisible()
  }
  await context.setOffline(false)

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`/plans?view=month&date=${fixedToday}`)
  await swipeToComplete(page, "月计划独立任务")
  await expect(taskButton(page, "月计划独立任务", true)).toBeVisible({ timeout: 150 })

  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations).toEqual([])

  for (const size of viewportMatrix) {
    await page.setViewportSize(size)
    for (const route of [
      `/plans?view=day&date=${fixedToday}`,
      `/plans?view=week&date=${fixedToday}`,
      `/plans?view=month&date=${fixedToday}`,
      `/plans?view=period&date=${semesterStart}&period=${periodValue}`,
    ]) {
      await page.goto(route)
      await expectNoHorizontalOverflow(page)
      await expectCardsInsideSurface(page)
      await expectLargeTargets(page.locator("section[aria-label$='导航'] button, section[aria-label$='导航'] input, section[aria-label$='导航'] select"))
      const view = new URL(route, "http://local").searchParams.get("view")!
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${view}.png`), fullPage: true })
      const firstTask = page.locator("button[class*='taskBar']").first()
      const initialHeight = (await readBox(firstTask)).height
      const initialFont = await firstTask.locator("span[class*='taskTitle']").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%" })
      await expectNoHorizontalOverflow(page)
      await expectCardsInsideSurface(page)
      await expect.poll(() => firstTask.locator("span[class*='taskTitle']").evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), { message: `${size.width}-${view}: doubled font` }).toBe(initialFont * 2)
      await expect.poll(async () => (await readBox(firstTask)).height, { message: `${size.width}-${view}: growing card` }).toBeGreaterThan(initialHeight)
      for (const task of await page.locator("button[class*='taskBar']").all()) {
        const state = await task.evaluate((element) => {
          const title = element.querySelector<HTMLElement>("span[class*='taskTitle']")!.getBoundingClientRect()
          const meta = element.querySelector<HTMLElement>("span[class*='taskMeta']")!.getBoundingClientRect()
          const status = element.querySelector<HTMLElement>("span[class*='trailing']")!.getBoundingClientRect()
          return {
            clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
            titleWidth: title.width,
            titleMetaOverlap: title.bottom > meta.top + 1,
            statusOverlap: title.right > status.left + 1 && title.bottom > status.top + 1,
          }
        })
        expect(state.clipped).toBe(false)
        expect(state.titleWidth).toBeGreaterThan(20)
        expect(state.titleMetaOverlap).toBe(false)
        expect(state.statusOverlap).toBe(false)
      }
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${view}-text200.png`), fullPage: true })
      await page.evaluate(() => { document.documentElement.style.fontSize = "" })
    }

    for (const control of [
      page.getByRole("link", { name: "新建任务" }).first(),
      viewButton(page, "日"),
      viewButton(page, "周"),
      viewButton(page, "月"),
      viewButton(page, "学期"),
    ]) {
      const box = await readBox(control)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }

  }
})
