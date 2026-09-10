import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

interface StoredNode {
  id: string
  parentId: string | null
  title: string
  deletedAt?: number
}

interface StoredNote {
  id: string
  nodeId: string
  markdown?: string
  revision?: number
  title: string
}

const viewportMatrix = [
  { width: 390, height: 695 },
  { width: 402, height: 695 },
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
  { width: 1024, height: 900 },
  { width: 1366, height: 900 },
] as const
const screenshotDirectory = resolve(process.cwd(), "..", "staging", "notes-foundation")

test.setTimeout(120_000)

async function finishOnboarding(page: Page) {
  await page.goto("/notes")
  const getStarted = page.getByRole("button", { name: "Get started" })
  if (await getStarted.isVisible()) await getStarted.click()
  await expect(page.getByRole("heading", { name: "笔记工作台" })).toBeVisible()
}

async function waitForSaved(page: Page) {
  await expect(page.getByText("已保存", { exact: true })).toBeVisible()
}

async function editCurrentNote(page: Page, title: string, markdown: string) {
  await page.getByLabel("笔记标题").fill(title)
  await page.getByLabel("Markdown 正文").fill(markdown)
  await expect(
    page.getByText("等待保存", { exact: true }).or(page.getByText("保存中…", { exact: true })),
  ).toBeVisible()
  await waitForSaved(page)
}

async function createFromHeader(page: Page) {
  const previousId = new URL(page.url()).searchParams.get("note")
  const isPhone = (page.viewportSize()?.width ?? 1024) < 768
  if (isPhone) await page.getByRole("button", { name: "知识树", exact: true }).click()
  const tree = isPhone
    ? page.getByRole("dialog", { name: "知识树" })
    : page.getByRole("complementary", { name: "知识树" })
  await tree.getByRole("button", { name: "笔记库", exact: true }).click()
  await tree.getByRole("button", { name: "在笔记库中新建文件夹" }).click()
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("新笔记目录")
  await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await tree.getByRole("button", { name: "在新笔记目录中新建" }).click()
  await page.getByRole("menuitem", { name: "新建笔记" }).click()
  await page.getByRole("textbox", { name: "笔记名称" }).fill("未命名笔记")
  await page.getByRole("textbox", { name: "笔记名称" }).press("Enter")
  await expect.poll(() => new URL(page.url()).searchParams.get("note")).not.toBe(previousId)
  await expect(page.getByLabel("笔记标题")).toHaveValue("未命名笔记")
}

async function readNotesStore(page: Page) {
  return page.evaluate(() => new Promise<{ nodes: StoredNode[]; notes: StoredNote[] }>((resolve, reject) => {
    const request = indexedDB.open("velo")
    request.onerror = () => reject(new Error(request.error?.message ?? "Cannot open notes database"))
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(["knowledgeNodes", "notes"], "readonly")
      const nodeRequest = transaction.objectStore("knowledgeNodes").getAll()
      const noteRequest = transaction.objectStore("notes").getAll()
      transaction.onerror = () => reject(new Error(transaction.error?.message ?? "Cannot read notes database"))
      transaction.oncomplete = () => {
        resolve({ nodes: nodeRequest.result as StoredNode[], notes: noteRequest.result as StoredNote[] })
        db.close()
      }
    }
  }))
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

async function expectFocusRing(locator: Locator) {
  await expect(locator).toBeFocused()
  const outline = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
  })
  expect(outline.style).not.toBe("none")
  expect(outline.width).toBeGreaterThanOrEqual(2)
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Expected visible bounds")
  return box
}

function expectInsideViewport(box: { x: number; y: number; width: number; height: number }, viewport: { width: number; height: number }) {
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThan(0)
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeLessThan(viewport.height)
}

async function expectTouchTarget(locator: Locator, viewport: { width: number; height: number }, minimumHeight = 44) {
  await expect(locator).toBeVisible()
  const box = await bounds(locator)
  expectInsideViewport(box, viewport)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(minimumHeight)
  const clipped = await locator.evaluate((element) => ({
    horizontal: element.scrollWidth > element.clientWidth + 1,
    vertical: element.scrollHeight > element.clientHeight + 1,
  }))
  expect(clipped).toEqual({ horizontal: false, vertical: false })
  return box
}

async function expectSurfaceNotClipped(locator: Locator, viewport: { width: number; height: number }) {
  const box = await bounds(locator)
  expectInsideViewport(box, viewport)
  const clipping = await locator.evaluate((element) => {
    const surface = element.getBoundingClientRect()
    const overflowingChildren = Array.from(element.querySelectorAll<HTMLElement>("*")).flatMap((child) => {
      const rect = child.getBoundingClientRect()
      if (rect.width > 0 && (rect.left < surface.left - 1 || rect.right > surface.right + 1)) {
        return [{ ariaLabel: child.getAttribute("aria-label"), className: child.className, tag: child.tagName }]
      }
      return []
    })
    return { clientWidth: element.clientWidth, overflowingChildren, scrollWidth: element.scrollWidth }
  })
  expect(clipping.scrollWidth, JSON.stringify(clipping)).toBeLessThanOrEqual(clipping.clientWidth + 1)
  return box
}

async function forceNextNoteWriteFailure(page: Page) {
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype
    const original = Object.getOwnPropertyDescriptor(prototype, "put")!.value as IDBObjectStore["put"]
    let shouldFail = true
    prototype.put = function put(value: unknown, key?: IDBValidKey) {
      if (shouldFail && this.name === "notes") {
        shouldFail = false
        prototype.put = original
        throw new DOMException("模拟笔记写入失败", "AbortError")
      }
      return original.call(this, value, key)
    }
  })
}

async function startComposing(locator: Locator, value: string) {
  await locator.evaluate((element, text) => {
    const textarea = element as HTMLTextAreaElement
    textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: text }))
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, text)
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertCompositionText", isComposing: true }))
  }, value)
}

async function endComposition(locator: Locator, value: string) {
  await locator.evaluate((element, text) => {
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }))
  }, value)
}

test("knowledge tree creates folders and notes, persists, and moves without a recycle bin", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await finishOnboarding(page)
  const knowledgeTree = page.getByRole("complementary", { name: "知识树" })
  await knowledgeTree.getByRole("button", { name: "在笔记库中新建文件夹" }).click()
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("数学")
  await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await knowledgeTree.getByRole("button", { name: "数学", exact: true }).click()
  await knowledgeTree.getByRole("button", { name: "在数学中新建" }).click()
  await page.getByRole("menuitem", { name: "新建笔记" }).click()
  await page.getByRole("textbox", { name: "笔记名称" }).fill("极限与连续")
  await page.getByRole("textbox", { name: "笔记名称" }).press("Enter")
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeVisible()
  await expect(page.getByText("笔记收件箱", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "收起数学" }).click()
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeHidden()
  await page.getByRole("button", { name: "展开数学" }).click()
  await page.reload()
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeVisible()

  await knowledgeTree.getByRole("button", { name: "笔记库", exact: true }).click()
  await knowledgeTree.getByRole("button", { name: "在笔记库中新建文件夹" }).click()
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("物理")
  await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await knowledgeTree.getByRole("button", { name: "数学", exact: true }).click()
  await page.getByRole("button", { name: "节点操作：数学" }).click()
  const actions = page.getByRole("dialog", { name: "数学" })
  await actions.getByRole("button", { name: "移动" }).click()
  await actions.getByLabel("移动到目录").selectOption({ label: "物理" })
  await actions.getByRole("button", { name: "确认移动" }).click()
  await page.getByRole("button", { name: "节点操作：数学" }).click()
  await expect(page.getByRole("dialog", { name: "数学" }).getByRole("button", { name: "移到回收站" })).toHaveCount(0)
  await expect(knowledgeTree.getByRole("button", { name: "回收站" })).toHaveCount(0)
  const stored = await readNotesStore(page)
  const mathematics = stored.nodes.find((node) => node.title === "数学")
  const physics = stored.nodes.find((node) => node.title === "物理")
  expect(mathematics?.parentId).toBe(physics?.id)
})

test("notes primary state is accessible and keyboard focus is visible", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await finishOnboarding(page)
  await page.keyboard.press("Tab")
  await expectFocusRing(page.locator(":focus"))
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations).toEqual([])
  await expectNoHorizontalOverflow(page)
})

test("notes workspace reflows at required widths with large text and reduced motion", async ({ page }, testInfo) => {
  await mkdir(screenshotDirectory, { recursive: true })
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize(viewportMatrix[0])
  await page.goto("/notes")
  await createFromHeader(page)
  await editCurrentNote(page, "响应式样本", "# 响应式样本\n用于浏览器布局验收。")

  for (const size of viewportMatrix) {
    await page.setViewportSize(size)
    await expectNoHorizontalOverflow(page)
    const heading = page.getByRole("heading", { name: "笔记工作台" })
    const header = heading.locator("xpath=ancestor::header[1]")
    const knowledgeButton = page.getByRole("button", { name: "知识树", exact: true })
    const dailyButton = page.getByRole("button", { name: "每日灵感", exact: true })
    const content = page.getByRole("region", { name: "笔记内容" })
    const editor = page.getByRole("region", { name: "笔记编辑器" })
    const textarea = page.getByLabel("Markdown 正文")
    const headerBox = await expectSurfaceNotClipped(header, size)
    const headingBox = await bounds(heading)
    expectInsideViewport(headingBox, size)
    const knowledgeButtonBox = await expectTouchTarget(knowledgeButton, size)
    const dailyButtonBox = await expectTouchTarget(dailyButton, size)
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(knowledgeButtonBox.x + 1)
    const contentBox = await expectSurfaceNotClipped(content, size)
    const editorBox = await expectSurfaceNotClipped(editor, size)
    const textareaBox = await expectSurfaceNotClipped(textarea, size)
    expect(editorBox.x).toBeGreaterThanOrEqual(contentBox.x - 1)
    expect(textareaBox.x).toBeGreaterThanOrEqual(editorBox.x - 1)
    expect(textareaBox.x + textareaBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width + 1)
    expect(textareaBox.width).toBeGreaterThan(100)
    expect(textareaBox.height).toBeGreaterThan(100)
    const measurement: Record<string, unknown> = {
      content: contentBox,
      editor: editorBox,
      header: headerBox,
      dailyButton: dailyButtonBox,
      knowledgeButton: knowledgeButtonBox,
      textarea: textareaBox,
      viewport: size,
    }

    if (size.width < 768) {
      const trigger = knowledgeButton
      const triggerBox = await expectTouchTarget(trigger, size)
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(dailyButtonBox.x + 1)
      if (size.width === 402) {
        for (const label of [heading, trigger.locator("span"), dailyButton.locator("span")]) {
          expect(await label.evaluate((element) => ({
            unclipped: element.scrollWidth <= element.clientWidth + 1,
            whiteSpace: getComputedStyle(element).whiteSpace,
          }))).toEqual({ unclipped: true, whiteSpace: "nowrap" })
        }
      }
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "知识树" })
      await expect(drawer).toBeVisible()
      const drawerBox = await expectSurfaceNotClipped(drawer, size)
      const treeBox = await expectTouchTarget(drawer.getByRole("button", { name: "打开笔记：响应式样本" }), size, 38)
      expect(treeBox.x).toBeGreaterThanOrEqual(drawerBox.x - 1)
      expect(treeBox.x + treeBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 1)
      measurement.tree = treeBox
      measurement.directory = drawerBox
      if (size.width === 402) {
        await page.screenshot({ path: resolve(screenshotDirectory, "notes-402-directory.png"), fullPage: true })
      }
      await page.keyboard.press("Escape")
      await expect(drawer).toBeHidden()
      await expectFocusRing(trigger)
    } else {
      const directory = page.getByRole("complementary", { name: "知识树" })
      const directoryBox = await expectSurfaceNotClipped(directory, size)
      const treeBox = await expectTouchTarget(page.getByRole("button", { name: "打开笔记：响应式样本" }), size, 38)
      expect(directoryBox.x + directoryBox.width).toBeLessThanOrEqual(contentBox.x + 1)
      expect(treeBox.x).toBeGreaterThanOrEqual(directoryBox.x - 1)
      expect(treeBox.x + treeBox.width).toBeLessThanOrEqual(directoryBox.x + directoryBox.width + 1)
      measurement.tree = treeBox
      measurement.directory = directoryBox
    }

    await testInfo.attach(`notes-layout-${size.width}.json`, {
      body: Buffer.from(JSON.stringify(measurement, null, 2)),
      contentType: "application/json",
    })
    if (size.width === 402 || size.width === 1024) {
      await page.screenshot({ path: resolve(screenshotDirectory, `notes-${size.width}-editor.png`), fullPage: true })
    }

    const initialFont = await page.getByLabel("Markdown 正文").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%" })
    await expect.poll(() => page.getByLabel("Markdown 正文").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(initialFont * 2)
    await expectNoHorizontalOverflow(page)
    const zoomedHeadingBox = await bounds(heading)
    const zoomedKnowledgeButtonBox = await expectTouchTarget(knowledgeButton, size)
    expectInsideViewport(await bounds(header), size)
    expect(zoomedHeadingBox.x + zoomedHeadingBox.width).toBeLessThanOrEqual(zoomedKnowledgeButtonBox.x + 1)
    await expectSurfaceNotClipped(content, size)
    await expectSurfaceNotClipped(editor, size)
    await expectSurfaceNotClipped(textarea, size)
    if (size.width < 768) {
      const trigger = knowledgeButton
      const triggerBox = await expectTouchTarget(trigger, size)
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual((await bounds(dailyButton)).x + 1)
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "知识树" })
      await expectSurfaceNotClipped(drawer, size)
      await expectTouchTarget(drawer.getByRole("button", { name: "打开笔记：响应式样本" }), size, 38)
      await page.keyboard.press("Escape")
    } else {
      const directory = page.getByRole("complementary", { name: "知识树" })
      const zoomedDirectoryBox = await expectSurfaceNotClipped(directory, size)
      const zoomedContentBox = await bounds(content)
      expect(zoomedDirectoryBox.x + zoomedDirectoryBox.width).toBeLessThanOrEqual(zoomedContentBox.x + 1)
      await expectTouchTarget(page.getByRole("button", { name: "打开笔记：响应式样本" }), size, 38)
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "" })
  }

  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations).toEqual([])
})

test("failed note save restores the local draft after reload", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.goto("/notes")
  await createFromHeader(page)
  await editCurrentNote(page, "保存恢复样本", "初始正文")
  const nodeId = new URL(page.url()).searchParams.get("note")
  expect(nodeId).toBeTruthy()

  await forceNextNoteWriteFailure(page)
  await page.getByLabel("Markdown 正文").fill("写入失败但不能丢失的草稿")
  await expect(page.getByText("保存失败，草稿仍在本机", { exact: true })).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("模拟笔记写入失败")
  expect(await page.evaluate((id) => window.localStorage.getItem(`velow-note-draft:${id}`), nodeId)).toContain("写入失败但不能丢失的草稿")

  await page.reload()
  await expect(page.getByLabel("Markdown 正文")).toHaveValue("写入失败但不能丢失的草稿")
  await expect(page.getByText("等待保存", { exact: true })).toBeVisible()
  await editCurrentNote(page, "保存恢复样本", "写入失败但不能丢失的草稿（已恢复）")
  const stored = await readNotesStore(page)
  expect(stored.notes.find((note) => note.nodeId === nodeId)?.markdown).toBe("写入失败但不能丢失的草稿（已恢复）")
})

test("two pages detect a stale revision and can reload the current version", async ({ context, page }) => {
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.goto("/notes")
  await createFromHeader(page)
  await editCurrentNote(page, "双页面冲突样本", "共同初稿")

  const secondPage = await context.newPage()
  await secondPage.goto(page.url())
  await waitForSaved(secondPage)
  await expect(secondPage.getByLabel("Markdown 正文")).toHaveValue("共同初稿")

  await editCurrentNote(page, "双页面冲突样本", "页面一的新版本")
  await secondPage.getByLabel("Markdown 正文").fill("页面二的本地草稿")
  await expect(secondPage.getByText("发现其他页面保存的新版本", { exact: true })).toBeVisible()
  await expect(secondPage.getByRole("alert")).toContainText("先重新加载")

  const draftDownloadPromise = secondPage.waitForEvent("download")
  await secondPage.getByRole("button", { name: "导出本地草稿" }).click()
  const draftDownload = await draftDownloadPromise
  const draftPath = await draftDownload.path()
  expect(draftPath).toBeTruthy()
  expect(await readFile(draftPath, "utf8")).toBe("页面二的本地草稿")

  await secondPage.getByRole("button", { name: "重新载入当前版本" }).click()
  await waitForSaved(secondPage)
  await expect(secondPage.getByLabel("Markdown 正文")).toHaveValue("页面一的新版本")
})

test("Daily Inspiration uses local dates, IME-safe autosave, month navigation, swipe and deletion", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.setViewportSize({ width: 390, height: 695 })
  await page.goto("/notes?area=daily&date=2026-09-07")

  const editor = page.getByRole("region", { name: "灵感编辑器" })
  const textarea = page.getByLabel("灵感正文")
  const selectedDay = page.locator('[data-date-key="2026-09-07"]')
  await expect(textarea).toBeVisible()
  await expect(textarea).not.toHaveAttribute("placeholder")
  await expect(editor.getByText("已保存", { exact: true })).toHaveCount(0)
  await expect(editor.getByText("保存中…", { exact: true })).toHaveCount(0)
  await expect(editor.getByText("每日灵感", { exact: true })).toHaveCount(0)
  await expect(page.getByText("回形针", { exact: true })).toHaveCount(0)

  const inspiration = "晚间课堂的一点灵感"
  await startComposing(textarea, inspiration)
  await page.waitForTimeout(450)
  await expect(selectedDay.locator("i")).toHaveCount(0)
  await endComposition(textarea, inspiration)
  await expect(selectedDay.locator("i")).toHaveCount(1)

  await page.reload()
  await expect(page.getByLabel("灵感正文")).toHaveValue(inspiration)
  await expect(page.locator('[data-date-key="2026-09-07"] i')).toHaveCount(1)

  await page.getByRole("button", { name: "下个月" }).click()
  await expect(page.getByLabel("月份")).toHaveValue("9")
  await page.getByRole("button", { name: "上个月" }).click()
  await expect(page.getByLabel("月份")).toHaveValue("8")
  await page.getByLabel("年份").fill("2027")
  await page.getByLabel("月份").selectOption("0")
  await expect(page.getByRole("button", { name: "2027年1月1日" })).toBeVisible()

  await page.getByLabel("年份").fill("2026")
  await page.getByLabel("月份").selectOption("8")
  const grid = page.getByRole("group", { name: "日期" })
  await grid.dispatchEvent("pointerdown", { button: 0, clientX: 320, clientY: 180, isPrimary: true, pointerId: 7 })
  await grid.dispatchEvent("pointerup", { button: 0, clientX: 120, clientY: 184, isPrimary: true, pointerId: 7 })
  await expect(page.getByLabel("月份")).toHaveValue("9")

  await page.getByLabel("月份").selectOption("8")
  await page.getByLabel("灵感正文").fill("")
  await expect(page.locator('[data-date-key="2026-09-07"] i')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel("灵感正文")).toHaveValue("")
})

test("Daily Inspiration and the knowledge tree fit real phone and tablet viewports", async ({ page }, testInfo) => {
  await mkdir(screenshotDirectory, { recursive: true })
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.emulateMedia({ reducedMotion: "reduce" })

  for (const size of viewportMatrix) {
    await page.setViewportSize(size)
    await page.goto("/notes?area=daily&date=2026-09-07")
    await expectNoHorizontalOverflow(page)

    const calendar = page.getByRole("region", { name: "灵感日历" })
    const paper = page.getByLabel("灵感正文").locator("..")
    const calendarBox = await expectSurfaceNotClipped(calendar, size)
    const paperBox = await bounds(paper)
    expect(paperBox.height).toBeGreaterThan(calendarBox.height)
    expect(await page.getByLabel("灵感正文").evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden")

    const dateButtons = await page.getByRole("group", { name: "日期" }).getByRole("button").all()
    const firstRow = await expectTouchTarget(dateButtons[0], size)
    const secondRow = await expectTouchTarget(dateButtons[7], size)
    expect(firstRow.y + firstRow.height).toBeLessThanOrEqual(secondRow.y + 0.5)
    for (const control of [page.getByRole("button", { name: "上个月" }), page.getByLabel("年份"), page.getByLabel("月份"), page.getByRole("button", { name: "下个月" }), page.getByRole("button", { name: "今天" })]) {
      await expectTouchTarget(control, size)
    }

    const directory = size.width < 768
      ? page.getByRole("dialog", { name: "知识树" })
      : page.getByRole("complementary", { name: "知识树" })
    if (size.width < 768) {
      await page.getByRole("button", { name: "知识树", exact: true }).click()
      await expect(directory).toBeVisible()
    } else {
      await expect(directory).toBeVisible()
    }
    const root = directory.getByRole("button", { name: "笔记库", exact: true })
    await expectTouchTarget(root, size, 38)
    await expect(directory.getByRole("button", { name: "回收站", exact: true })).toHaveCount(0)

    await testInfo.attach(`daily-layout-${size.width}.json`, {
      body: Buffer.from(JSON.stringify({ calendar: calendarBox, paper: paperBox, viewport: size }, null, 2)),
      contentType: "application/json",
    })
    if (size.width === 402 || size.width === 1024) {
      await page.screenshot({ path: resolve(screenshotDirectory, `daily-${size.width}.png`), fullPage: true })
    }
    if (size.width < 768) await page.keyboard.press("Escape")
  }

  await page.setViewportSize({ width: 402, height: 695 })
  await page.goto("/notes?area=daily&date=2026-09-07")
  const shortHeight = (await bounds(page.getByLabel("灵感正文").locator(".."))).height
  await page.getByLabel("灵感正文").fill(Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 行灵感`).join("\n"))
  await expect.poll(async () => (await bounds(page.getByLabel("灵感正文").locator(".."))).height).toBeGreaterThan(shortHeight)
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([])
})

test("phone knowledge tree keeps folder creation visible and offers sibling or child levels", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("velow-notebook:onboarding-complete", "1"))
  await page.setViewportSize({ width: 402, height: 695 })
  await page.goto("/notes")

  await page.getByRole("button", { name: "知识树", exact: true }).click()
  const drawer = page.getByRole("dialog", { name: "知识树" })
  await drawer.getByRole("button", { name: "在笔记库中新建文件夹" }).click()
  await expect(drawer.getByRole("group", { name: "文件夹名称，位置：笔记库" })).toBeVisible()
  const rootFolderInput = drawer.getByRole("textbox", { name: "文件夹名称" })
  await expect(rootFolderInput).toHaveCSS("border-top-width", "0px")
  await expect(rootFolderInput).toHaveCSS("border-left-width", "0px")
  await expect(rootFolderInput).toHaveCSS("outline-style", "none")
  await rootFolderInput.fill("专业")
  await drawer.getByRole("button", { name: "保存文件夹名称" }).click()
  await expect(drawer).toBeVisible()
  await drawer.getByRole("button", { name: "在专业中新建" }).click()
  await expect(page.getByRole("menuitem", { name: "新建同级文件夹" })).toBeVisible()
  await page.getByRole("menuitem", { name: "新建下一级文件夹" }).click()
  await expect(drawer.getByRole("group", { name: "文件夹名称，位置：笔记库 / 专业" })).toBeVisible()
  await drawer.getByRole("textbox", { name: "文件夹名称" }).fill("数学")
  await drawer.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await expect(drawer).toBeVisible()

  const professional = drawer.getByRole("button", { name: "专业", exact: true })
  const professionalToggle = drawer.getByRole("button", { name: "收起专业" })
  const professionalToggleIcon = await bounds(professionalToggle.locator("svg"))
  const professionalFolderIcon = await bounds(professional.locator("svg"))
  const professionalChildren = await bounds(professional.locator("xpath=ancestor::li[1]/ul"))
  expect((await bounds(professional)).height).toBeLessThanOrEqual(38)
  expect((await bounds(professionalToggle)).height).toBeLessThanOrEqual(38)
  expect(Math.abs(professionalChildren.x - (professionalToggleIcon.x + professionalToggleIcon.width / 2))).toBeLessThanOrEqual(1)
  expect(professionalFolderIcon.x - (professionalToggleIcon.x + professionalToggleIcon.width)).toBeLessThanOrEqual(16)

  const mathematics = drawer.getByRole("button", { name: "数学", exact: true })
  const mathematicsPlus = drawer.getByRole("button", { name: "在数学中新建" })
  await expect(mathematicsPlus).toBeVisible()
  const mathematicsBox = await bounds(mathematics)
  const plusBox = await bounds(mathematicsPlus)
  expect(plusBox.height).toBeLessThanOrEqual(38)
  expect(plusBox.x).toBeGreaterThanOrEqual(mathematicsBox.x + mathematicsBox.width - 1)
  expect(plusBox.x - (mathematicsBox.x + mathematicsBox.width)).toBeLessThanOrEqual(8)
  await expect(mathematics).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(mathematicsPlus).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(mathematicsPlus).toHaveCSS("border-top-width", "0px")
  const mathematicsLabelBox = await bounds(mathematics.locator("span"))
  const plusIconBox = await bounds(mathematicsPlus.locator("svg"))
  expect(plusIconBox.x - (mathematicsLabelBox.x + mathematicsLabelBox.width)).toBeLessThanOrEqual(6)

  await mathematicsPlus.click()
  const creationMenu = page.getByRole("menu", { name: "新建节点" })
  await expect(creationMenu).toHaveCSS("position", "static")
  for (const option of ["新建同级文件夹", "新建下一级文件夹", "新建笔记"]) {
    await expect(creationMenu.getByRole("menuitem", { name: option })).toBeVisible()
  }
  const drawerBox = await bounds(drawer)
  const menuBox = await bounds(creationMenu)
  expect(menuBox.x).toBeGreaterThanOrEqual(drawerBox.x)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width)
  await page.getByRole("menuitem", { name: "新建同级文件夹" }).click()
  await expect(drawer.getByRole("group", { name: "文件夹名称，位置：笔记库 / 专业" })).toBeVisible()
  await drawer.getByRole("textbox", { name: "文件夹名称" }).fill("物理")
  await drawer.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await expect(drawer).toBeVisible()

  await drawer.getByRole("button", { name: "在物理中新建" }).click()
  await page.getByRole("menuitem", { name: "新建笔记" }).click()
  await expect(drawer.getByRole("group", { name: "笔记名称，位置：笔记库 / 专业 / 物理" })).toBeVisible()
  await drawer.getByRole("textbox", { name: "笔记名称" }).fill("课堂记录")
  await expect(drawer.getByRole("button", { name: "保存笔记名称" })).toBeVisible()
  await drawer.getByRole("button", { name: "保存笔记名称" }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole("navigation", { name: "当前笔记路径" })).toContainText("笔记库/专业/物理/课堂记录")
  await expect(page.getByLabel("Markdown 正文")).toBeVisible()
  await expectTouchTarget(page.getByRole("button", { name: "返回知识树" }), { width: 402, height: 695 })
  await page.getByRole("button", { name: "返回知识树" }).click()
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole("button", { name: "打开笔记：课堂记录" })).toHaveAttribute("aria-current", "page")
})

test("phone knowledge-tree title strip exports the selected folder as a real PDF", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("velow-notebook:onboarding-complete", "1")
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined })
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined })
  })
  await page.setViewportSize({ width: 368, height: 694 })
  await page.goto("/notes")
  await createFromHeader(page)
  await editCurrentNote(page, "导数复习", "# 定义\n\n变化率用于描述函数变化。\n\n- 平均变化率\n- 瞬时变化率")
  await page.getByRole("button", { name: "返回知识树" }).click()
  const drawer = page.getByRole("dialog", { name: "知识树" })
  const header = drawer.locator("header")
  const searchButton = drawer.getByRole("button", { name: "搜索知识树" })
  const exportButton = drawer.getByRole("button", { name: "导出 PDF" })
  const closeButton = drawer.getByRole("button", { name: "关闭知识树" })
  await expect(header).toHaveCSS("border-top-width", "1px")
  await expect(header).toHaveCSS("border-radius", "14px")
  await expectTouchTarget(searchButton, { width: 368, height: 694 })
  await expectTouchTarget(exportButton, { width: 368, height: 694 })
  const searchBox = await bounds(searchButton)
  const exportBox = await bounds(exportButton)
  const closeBox = await bounds(closeButton)
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(exportBox.x + 1)
  expect(exportBox.x + exportBox.width).toBeLessThanOrEqual(closeBox.x + 1)

  await searchButton.click()
  await drawer.getByRole("searchbox", { name: "搜索文件夹和笔记" }).fill("变化率")
  const result = drawer.getByRole("button", { name: "打开搜索结果：导数复习" })
  await expect(result).toContainText("笔记库 / 新笔记目录 / 导数")
  await result.click()
  await expect(drawer).toBeHidden()
  await page.getByRole("button", { name: "返回知识树" }).click()
  await drawer.getByRole("button", { name: "新笔记目录", exact: true }).click()

  const downloadPromise = page.waitForEvent("download")
  await exportButton.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("新笔记目录.pdf")
  await mkdir(screenshotDirectory, { recursive: true })
  const pdfPath = resolve(screenshotDirectory, "notes-folder-export.pdf")
  await download.saveAs(pdfPath)
  expect((await readFile(pdfPath)).subarray(0, 5).toString("latin1")).toBe("%PDF-")
  await expect(page.getByText("新笔记目录.pdf 已保存到浏览器下载。" )).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, "notes-pdf-export-mobile.png"), fullPage: true })
})

test("HTTP preview creates stable IDs without crypto.randomUUID", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("velow-notebook:onboarding-complete", "1")
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined })
  })
  await page.goto("/notes")
  expect(new URL(page.url()).protocol).toBe("http:")

  await createFromHeader(page)
  await editCurrentNote(page, "HTTP ID 一", "第一篇")
  const firstId = new URL(page.url()).searchParams.get("note")
  await createFromHeader(page)
  await editCurrentNote(page, "HTTP ID 二", "第二篇")
  const secondId = new URL(page.url()).searchParams.get("note")
  expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(secondId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(secondId).not.toBe(firstId)
})
