import { expect, test } from "@playwright/test"

type NativeCloseEvent = { label: string | null; open: boolean }
type DialogTraceWindow = Window & { nativeDialogCloses: NativeCloseEvent[] }

test("development StrictMode preserves reopened native dialogs and honors intentional close", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("velow-notebook:onboarding-complete", "1")
    const tracedWindow = window as unknown as DialogTraceWindow
    tracedWindow.nativeDialogCloses = []
    document.addEventListener("close", (event) => {
      if (event.target instanceof HTMLDialogElement) {
        tracedWindow.nativeDialogCloses.push({ label: event.target.getAttribute("aria-labelledby"), open: event.target.open })
      }
    }, true)
  })
  await page.goto("/plans?view=week&date=2026-08-30")
  await expect(page.locator('script[src="/@vite/client"]')).toHaveCount(1)
  await page.getByRole("link", { name: "新建任务" }).click()
  const editor = page.getByRole("dialog", { name: "新建学习任务" })
  await editor.getByLabel("任务标题").fill("StrictMode 原生弹窗回归")
  await editor.getByRole("button", { name: "保存任务" }).click()
  await expect(editor).toBeHidden()

  const task = page.getByRole("button", { name: "打开任务操作：StrictMode 原生弹窗回归" })
  await task.click()
  const actions = page.getByRole("dialog", { name: "StrictMode 原生弹窗回归", exact: true })
  // The real app is wrapped in StrictMode. Its cleanup closes then reopens this
  // conditionally mounted dialog; Chrome delivers the old close event afterward.
  await expect.poll(() => page.evaluate(() => (window as unknown as DialogTraceWindow).nativeDialogCloses.some((event) => event.label === "task-actions-heading" && event.open))).toBe(true)
  await expect(actions).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(actions).toBeHidden()
  await expect(task).toBeFocused()

  await task.click()
  await actions.getByRole("button", { name: "删除", exact: true }).click()
  const deletion = page.getByRole("dialog", { name: "确定删除“StrictMode 原生弹窗回归”吗？" })
  await expect.poll(() => page.evaluate(() => (window as unknown as DialogTraceWindow).nativeDialogCloses.some((event) => event.label === "delete-task-heading" && event.open))).toBe(true)
  await expect(deletion).toBeVisible()
  await deletion.getByRole("button", { name: "取消" }).click()
  await expect(deletion).toBeHidden()
  await expect(task).toBeFocused()

  await task.click()
  await actions.getByRole("button", { name: "编辑", exact: true }).click()
  const editDialog = page.getByRole("dialog", { name: "编辑学习任务" })
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel("科目").fill("仍可编辑")
  await page.keyboard.press("Escape")
  await expect(editDialog).toBeHidden()
  await expect(task).toBeFocused()

  await task.click()
  await actions.evaluate((dialog: HTMLDialogElement) => new Promise<void>((resolve) => {
    dialog.addEventListener("close", () => resolve(), { once: true })
    dialog.close()
  }))
  await expect(actions).toBeHidden()
  await expect(task).toBeFocused()

  await task.click()
  await actions.getByRole("button", { name: "标记为完成" }).click()
  await expect(actions).toBeHidden()
  await expect(page.getByRole("button", { name: "已完成：StrictMode 原生弹窗回归" })).toBeFocused()
})
