import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

interface StoredNode {
  id: string
  inbox?: boolean
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

const parentTitle = "网络安全课堂笔记"
const parentMarkdown = [
  "# 同源策略",
  "浏览器会隔离不同来源的数据。",
  "",
  "![远程图](https://notes.invalid/should-not-load.png)",
  "<script>window.__notesUnsafeScript = true</script>",
].join("\n")
const childTitle = "CSP 复习卡"
const childMarkdown = "## 检查点\n- 阻止未授权脚本\n- 限制资源来源"
const directoryTitle = "计算机网络"
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

async function openNote(page: Page, title: string) {
  await page.getByRole("button", { name: `打开笔记：${title}` }).click()
  await expect(page.getByLabel("笔记标题")).toHaveValue(title)
}

async function openActions(page: Page) {
  await page.getByRole("button", { name: "笔记操作" }).click()
  return page.getByRole("dialog", { name: /.+/ }).filter({ has: page.getByText("笔记操作", { exact: true }) })
}

async function createFromActions(page: Page, dialog: Locator, action: "新建子笔记" | "新建同级笔记") {
  const previousId = new URL(page.url()).searchParams.get("note")
  await dialog.getByRole("button", { name: action }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get("note")).not.toBe(previousId)
  await expect(page.getByLabel("笔记标题")).toHaveValue("未命名笔记")
}

async function createFromHeader(page: Page) {
  const previousId = new URL(page.url()).searchParams.get("note")
  await page.getByRole("button", { name: "新建笔记", exact: true }).click()
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

test("notes flow preserves subtree IDs and content through move, trash, restore, and Markdown export", async ({ page }) => {
  const remoteRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().startsWith("https://notes.invalid/")) remoteRequests.push(request.url())
  })

  await page.setViewportSize({ width: 1024, height: 900 })
  await finishOnboarding(page)
  await page.getByRole("button", { name: "笔记收件箱" }).click()
  await page.getByRole("button", { name: "创建第一篇笔记" }).click()
  await editCurrentNote(page, parentTitle, parentMarkdown)

  const initial = await readNotesStore(page)
  const initialParent = initial.nodes.find((node) => node.title === parentTitle)
  expect(initialParent).toMatchObject({ inbox: true, parentId: null })
  expect(initial.notes.find((note) => note.nodeId === initialParent?.id)).toMatchObject({ markdown: parentMarkdown, title: parentTitle })

  await page.getByRole("button", { name: "阅读", exact: true }).click()
  await expect(page.getByLabel("Markdown 阅读内容").getByRole("heading", { name: "同源策略" })).toBeVisible()
  await expect(page.getByText("图片“远程图”已阻止加载")).toBeVisible()
  expect(remoteRequests).toEqual([])
  expect(await page.evaluate(() => Boolean((window as typeof window & { __notesUnsafeScript?: boolean }).__notesUnsafeScript))).toBe(false)

  await page.reload()
  await waitForSaved(page)
  await expect(page.getByLabel("笔记标题")).toHaveValue(parentTitle)
  await expect(page.getByLabel("Markdown 正文")).toHaveValue(parentMarkdown)

  let dialog = await openActions(page)
  await createFromActions(page, dialog, "新建子笔记")
  await editCurrentNote(page, childTitle, childMarkdown)

  await openNote(page, parentTitle)
  dialog = await openActions(page)
  await createFromActions(page, dialog, "新建同级笔记")
  await editCurrentNote(page, directoryTitle, "# 目录")

  const afterDirectorySave = await readNotesStore(page)
  expect(afterDirectorySave.nodes.some((node) => node.title === directoryTitle)).toBe(true)
  await expect(page.getByRole("button", { name: `打开笔记：${directoryTitle}` })).toBeVisible()

  await openNote(page, parentTitle)
  dialog = await openActions(page)
  await dialog.getByLabel("移动到目录").selectOption({ label: directoryTitle })
  await dialog.getByRole("button", { name: "确认移动" }).click()

  const moved = await readNotesStore(page)
  const movedParent = moved.nodes.find((node) => node.title === parentTitle)
  const movedChild = moved.nodes.find((node) => node.title === childTitle)
  const movedDirectory = moved.nodes.find((node) => node.title === directoryTitle)
  expect(movedParent?.id).toBe(initialParent?.id)
  expect(movedParent?.parentId).toBe(movedDirectory?.id)
  expect(movedChild?.parentId).toBe(movedParent?.id)

  dialog = await openActions(page)
  await dialog.getByRole("button", { name: "移到回收站" }).click()
  const confirm = page.getByRole("dialog", { name: "移到回收站？" })
  await confirm.getByRole("button", { name: "确认移到回收站" }).click()
  await expect(page.getByRole("button", { name: "恢复笔记" })).toBeVisible()
  await page.getByRole("button", { name: "恢复笔记" }).click()
  await waitForSaved(page)

  const restored = await readNotesStore(page)
  const restoredParent = restored.nodes.find((node) => node.id === initialParent?.id)
  const restoredChild = restored.nodes.find((node) => node.id === movedChild?.id)
  expect(restoredParent).toMatchObject({ parentId: movedDirectory?.id, title: parentTitle })
  expect(restoredParent?.deletedAt).toBeUndefined()
  expect(restoredChild).toMatchObject({ parentId: initialParent?.id, title: childTitle })
  expect(restoredChild?.deletedAt).toBeUndefined()
  expect(restored.notes.find((note) => note.nodeId === restoredParent?.id)?.markdown).toBe(parentMarkdown)
  expect(restored.notes.find((note) => note.nodeId === restoredChild?.id)?.markdown).toBe(childMarkdown)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 Markdown", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.md$/)
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const exported = await readFile(downloadPath, "utf8")
  expect(exported).toContain(parentTitle)
  expect(exported).toContain("浏览器会隔离不同来源的数据。")
  expect(exported).toContain(childTitle)
  expect(exported).toContain("阻止未授权脚本")
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
    const measurement: Record<string, unknown> = {
      content: await bounds(page.getByRole("region", { name: "笔记内容" })),
      editor: await bounds(page.getByRole("region", { name: "笔记编辑器" })),
      viewport: size,
    }

    if (size.width < 768) {
      const trigger = page.getByRole("button", { name: "目录", exact: true })
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "笔记目录" })
      await expect(drawer).toBeVisible()
      measurement.tree = await bounds(drawer.getByRole("button", { name: "打开笔记：响应式样本" }))
      measurement.directory = await bounds(drawer)
      if (size.width === 402) {
        await page.screenshot({ path: resolve(screenshotDirectory, "notes-402-directory.png"), fullPage: true })
      }
      await page.keyboard.press("Escape")
      await expect(drawer).toBeHidden()
      await expectFocusRing(trigger)
    } else {
      measurement.tree = await bounds(page.getByRole("button", { name: "打开笔记：响应式样本" }))
      measurement.directory = await bounds(page.getByRole("complementary", { name: "笔记目录" }))
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
