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
    await page.goto('/focus')
    await expect(page.getByRole('heading', { name: '保持心流' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/ui-focus-${width}.png`, fullPage: true })
  })
}
