import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const width of [320, 390, 768]) {
  test(`UI baseline at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.addInitScript(() => localStorage.setItem('velow-notebook:onboarding-complete', '1'))
    await page.goto('/')
    const all = page.getByRole('link', { name: '查看全部' })
    await expect(all).toBeVisible()
    const bounds = await all.boundingBox()
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('link', { name: '拍照录入' })).toHaveCount(0)
    await expect(page.getByText('敬请期待')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/ui-home-${width}.png`, fullPage: true })
    if (width === 390) {
      await page.getByRole('button', { name: '关闭提醒', exact: true }).click()
      await expect(page.getByRole('button', { name: '开启提醒', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await expect(page.getByRole('button', { name: '开启提醒', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '开启提醒', exact: true }).click()
      await page.getByRole('button', { name: '关闭提醒设置提示' }).click()
    }
    await page.goto('/notes')
    await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible()
    // Isolated browser test context only; no user data is changed.
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('velo')
        request.onerror = () => reject(new Error(request.error?.message ?? 'Test database open failed'))
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['knowledgeNodes', 'notes'], 'readwrite')
          tx.objectStore('knowledgeNodes').put({ id: 'ui-folder', type: 'folder', title: '数', parentId: null, order: 0, createdAt: 1, updatedAt: 1 })
          tx.objectStore('knowledgeNodes').put({ id: 'ui-note', type: 'note', title: '长标题用于验证路径文字省略而不会挤出返回按钮', parentId: 'ui-folder', order: 0, createdAt: 1, updatedAt: 1 })
          tx.objectStore('notes').put({ id: 'ui-document', nodeId: 'ui-note', title: '路径测试', markdown: '', plainText: '', content: {}, revision: 0, createdAt: 1, updatedAt: 1 })
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => { db.close(); reject(new Error(tx.error?.message ?? 'Test fixture write failed')) }
        }
      })
    })
    await page.goto('/notes?note=ui-note')
    const path = page.getByRole('navigation', { name: '当前笔记路径' })
    await expect(path).toBeVisible()
    for (const button of await path.getByRole('button').all()) {
      const box = await button.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/ui-notes-${width}.png`, fullPage: true })
    if (width === 390) {
      await page.getByRole('button', { name: '返回知识树' }).click()
      const folder = page.getByRole('dialog', { name: '知识树', exact: true }).getByRole('button', { name: '数', exact: true })
      const box = (await folder.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await expect(page.getByRole('button', { name: '删除文件夹', exact: true })).toBeVisible()
      await page.mouse.up()
      await page.getByRole('button', { name: '删除文件夹', exact: true }).click()
      await expect(page.getByText(/1 篇笔记/)).toBeVisible()
      await page.getByRole('button', { name: '确认删除文件夹' }).click()
      await expect(page.getByRole('button', { name: '撤销删除数' })).toBeVisible()
      await page.getByRole('button', { name: '撤销删除数' }).click()
      await page.goto('/notes?note=ui-note')
      await expect(page.getByLabel('笔记标题')).toHaveValue('路径测试')
    }
    await page.goto('/focus')
    await expect(page.getByRole('heading', { name: '保持心流' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/ui-focus-${width}.png`, fullPage: true })
    for (const [route, heading] of [['/plans', '学习计划'], ['/settings', '设置']]) {
      await page.goto(route)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/ui-${route.slice(1)}-${width}.png`, fullPage: true })
    }
  })
}
