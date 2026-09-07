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
  { width: 390, height: 844 },
  { width: 402, height: 874 },
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
  await page.getByRole("button", { name: "新建", exact: true }).click()
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

async function expectTouchTarget(locator: Locator, viewport: { width: number; height: number }) {
  await expect(locator).toBeVisible()
  const box = await bounds(locator)
  expectInsideViewport(box, viewport)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
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

test("knowledge tree creates folders and notes, persists, moves, and restores a subtree", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await finishOnboarding(page)
  await page.getByRole("button", { name: "新建" }).click()
  await page.getByRole("menuitem", { name: "新建文件夹" }).click()
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("数学")
  await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await page.getByRole("button", { name: "数学", exact: true }).click()
  await page.getByRole("button", { name: "节点操作：数学" }).click()
  await page.getByRole("dialog", { name: "数学" }).getByRole("button", { name: "新建笔记" }).click()
  await page.getByRole("textbox", { name: "笔记名称" }).fill("极限与连续")
  await page.getByRole("textbox", { name: "笔记名称" }).press("Enter")
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeVisible()
  await expect(page.getByText("笔记收件箱", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "收起数学" }).click()
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeHidden()
  await page.getByRole("button", { name: "展开数学" }).click()
  await page.reload()
  await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeVisible()

  await page.getByRole("button", { name: "新建" }).click()
  await page.getByRole("menuitem", { name: "新建文件夹" }).click()
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("物理")
  await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
  await page.getByRole("button", { name: "数学", exact: true }).click()
  await page.getByRole("button", { name: "节点操作：数学" }).click()
  const actions = page.getByRole("dialog", { name: "数学" })
  await actions.getByRole("button", { name: "移动" }).click()
  await actions.getByLabel("移动到目录").selectOption({ label: "物理" })
  await actions.getByRole("button", { name: "确认移动" }).click()
  await page.getByRole("button", { name: "节点操作：数学" }).click()
  await page.getByRole("dialog", { name: "数学" }).getByRole("button", { name: "移到回收站" }).click()
  await page.getByRole("dialog", { name: "移到回收站？" }).getByRole("button", { name: "确认移到回收站" }).click()
  await page.getByRole("button", { name: "恢复文件夹" }).click()
  const restored = await readNotesStore(page)
  expect(restored.nodes.find((node) => node.title === "数学")?.deletedAt).toBeUndefined()
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
    const newButton = page.getByRole("button", { name: "新建", exact: true })
    const content = page.getByRole("region", { name: "笔记内容" })
    const editor = page.getByRole("region", { name: "笔记编辑器" })
    const textarea = page.getByLabel("Markdown 正文")
    const headerBox = await expectSurfaceNotClipped(header, size)
    const headingBox = await bounds(heading)
    expectInsideViewport(headingBox, size)
    const newButtonBox = await expectTouchTarget(newButton, size)
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(newButtonBox.x + 1)
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
      newButton: newButtonBox,
      textarea: textareaBox,
      viewport: size,
    }

    if (size.width < 768) {
      const trigger = page.getByRole("button", { name: "目录", exact: true })
      const triggerBox = await expectTouchTarget(trigger, size)
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(newButtonBox.x + 1)
      if (size.width === 402) {
        for (const label of [heading, trigger.locator("span"), newButton.locator("span")]) {
          expect(await label.evaluate((element) => ({
            unclipped: element.scrollWidth <= element.clientWidth + 1,
            whiteSpace: getComputedStyle(element).whiteSpace,
          }))).toEqual({ unclipped: true, whiteSpace: "nowrap" })
        }
      }
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "笔记目录" })
      await expect(drawer).toBeVisible()
      const drawerBox = await expectSurfaceNotClipped(drawer, size)
      const treeBox = await expectTouchTarget(drawer.getByRole("button", { name: "打开笔记：响应式样本" }), size)
      const navBoxes = []
      for (const button of await drawer.getByRole("navigation", { name: "笔记区域" }).getByRole("button").all()) {
        navBoxes.push(await expectTouchTarget(button, size))
      }
      expect(treeBox.x).toBeGreaterThanOrEqual(drawerBox.x - 1)
      expect(treeBox.x + treeBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 1)
      measurement.tree = treeBox
      measurement.directory = drawerBox
      measurement.navigation = navBoxes
      if (size.width === 402) {
        await page.screenshot({ path: resolve(screenshotDirectory, "notes-402-directory.png"), fullPage: true })
      }
      await page.keyboard.press("Escape")
      await expect(drawer).toBeHidden()
      await expectFocusRing(trigger)
    } else {
      const directory = page.getByRole("complementary", { name: "笔记目录" })
      const directoryBox = await expectSurfaceNotClipped(directory, size)
      const treeBox = await expectTouchTarget(page.getByRole("button", { name: "打开笔记：响应式样本" }), size)
      const navBoxes = []
      for (const button of await directory.getByRole("navigation", { name: "笔记区域" }).getByRole("button").all()) {
        navBoxes.push(await expectTouchTarget(button, size))
      }
      expect(directoryBox.x + directoryBox.width).toBeLessThanOrEqual(contentBox.x + 1)
      expect(treeBox.x).toBeGreaterThanOrEqual(directoryBox.x - 1)
      expect(treeBox.x + treeBox.width).toBeLessThanOrEqual(directoryBox.x + directoryBox.width + 1)
      measurement.tree = treeBox
      measurement.directory = directoryBox
      measurement.navigation = navBoxes
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
    const zoomedNewButtonBox = await expectTouchTarget(newButton, size)
    expectInsideViewport(await bounds(header), size)
    expect(zoomedHeadingBox.x + zoomedHeadingBox.width).toBeLessThanOrEqual(zoomedNewButtonBox.x + 1)
    await expectSurfaceNotClipped(content, size)
    await expectSurfaceNotClipped(editor, size)
    await expectSurfaceNotClipped(textarea, size)
    if (size.width < 768) {
      const trigger = page.getByRole("button", { name: "目录", exact: true })
      const triggerBox = await expectTouchTarget(trigger, size)
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(zoomedNewButtonBox.x + 1)
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "笔记目录" })
      await expectSurfaceNotClipped(drawer, size)
      for (const button of await drawer.getByRole("navigation", { name: "笔记区域" }).getByRole("button").all()) {
        await expectTouchTarget(button, size)
      }
      await expectTouchTarget(drawer.getByRole("button", { name: "打开笔记：响应式样本" }), size)
      await page.keyboard.press("Escape")
    } else {
      const directory = page.getByRole("complementary", { name: "笔记目录" })
      const zoomedDirectoryBox = await expectSurfaceNotClipped(directory, size)
      const zoomedContentBox = await bounds(content)
      expect(zoomedDirectoryBox.x + zoomedDirectoryBox.width).toBeLessThanOrEqual(zoomedContentBox.x + 1)
      for (const button of await directory.getByRole("navigation", { name: "笔记区域" }).getByRole("button").all()) {
        await expectTouchTarget(button, size)
      }
      await expectTouchTarget(page.getByRole("button", { name: "打开笔记：响应式样本" }), size)
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
