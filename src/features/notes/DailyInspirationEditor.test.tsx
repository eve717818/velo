import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeloDB } from '@/db/velo-db'
import { DailyInspirationEditor, type DailyInspirationEditorHandle } from './DailyInspirationEditor'
import { dailyDraftStorageKey } from './daily-inspiration-state'
import { saveDailyInspiration } from './daily-inspiration-service'

let db: VeloDB
beforeEach(() => {
  db = new VeloDB(`daily-editor-${crypto.randomUUID()}`)
  localStorage.clear()
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await db.delete()
})

async function ready() {
  const input = screen.getByRole('textbox', { name: '灵感正文' })
  await waitFor(() => expect(input).not.toHaveAttribute('readonly'))
  return input as HTMLTextAreaElement
}

describe('DailyInspirationEditor', () => {
  it('shows only a blank normal textarea inside the paper and focuses through its ref', async () => {
    const ref = createRef<DailyInspirationEditorHandle>()
    render(<StrictMode><DailyInspirationEditor db={db} dateKey="2026-09-07" ref={ref} /></StrictMode>)
    const input = await ready()
    expect(input).toHaveValue('')
    expect(input).not.toHaveAttribute('placeholder')
    expect(input.parentElement?.textContent).toBe('')
    expect(within(input.parentElement!).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => ref.current?.focus())
    expect(input).toHaveFocus()
    expect(await db.dailyInspirations.count()).toBe(0)
  })

  it('holds composition and writes the final text only after the 320ms debounce', async () => {
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" />)
    const input = await ready()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '灵' } })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(await db.dailyInspirations.count()).toBe(0)
    fireEvent.change(input, { target: { value: '灵感' } })
    fireEvent.compositionEnd(input)
    await act(() => vi.advanceTimersByTimeAsync(319))
    expect(await db.dailyInspirations.count()).toBe(0)
    await act(() => vi.advanceTimersByTimeAsync(1))
    vi.useRealTimers()
    await waitFor(async () => expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('灵感'))
    expect(localStorage.getItem(dailyDraftStorageKey('2026-09-07'))).toBeNull()
  })

  it('preserves a failed draft, shows one external recovery alert, and retries successfully', async () => {
    let fail = true
    const save: typeof saveDailyInspiration = (...args) => fail ? Promise.reject(new Error('磁盘写入失败')) : saveDailyInspiration(...args)
    const ref = createRef<DailyInspirationEditorHandle>()
    const { unmount } = render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} ref={ref} />)
    fireEvent.change(await ready(), { target: { value: '不能丢掉' } })
    await act(async () => { expect(await ref.current!.flush()).toBe(false) })
    const alert = screen.getByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('textbox').parentElement).not.toContainElement(alert)
    expect(localStorage.getItem(dailyDraftStorageKey('2026-09-07'))).toContain('不能丢掉')
    unmount()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} ref={ref} />)
    expect(await ready()).toHaveValue('不能丢掉')
    await act(async () => { await ref.current!.flush() })
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    await waitFor(async () => expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('不能丢掉'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('flushes the old date before displaying a new date and never writes old text into it', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const save: typeof saveDailyInspiration = async (...args) => { await gate; return saveDailyInspiration(...args) }
    const { rerender } = render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} />)
    fireEvent.change(await ready(), { target: { value: '七号' } })
    rerender(<DailyInspirationEditor db={db} dateKey="2026-09-08" saveDailyInspiration={save} />)
    expect(screen.getByRole('textbox')).toHaveValue('七号')
    await act(async () => { release(); await gate })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('七号')
    expect(await db.dailyInspirations.get('2026-09-08')).toBeUndefined()
  })

  it('blocks a date change when saving fails and keeps the original draft editable', async () => {
    const save: typeof saveDailyInspiration = () => Promise.reject(new Error('保存失败'))
    const { rerender } = render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} />)
    fireEvent.change(await ready(), { target: { value: '七号未保存' } })
    rerender(<DailyInspirationEditor db={db} dateKey="2026-09-08" saveDailyInspiration={save} />)
    await screen.findByRole('alert')
    expect(await ready()).toHaveValue('七号未保存')
    expect(await db.dailyInspirations.count()).toBe(0)
  })

  it('serializes edits during an in-flight save and clears the persisted row with the latest revision', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let count = 0
    const save: typeof saveDailyInspiration = async (...args) => { if (++count === 1) await gate; return saveDailyInspiration(...args) }
    const ref = createRef<DailyInspirationEditorHandle>()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} ref={ref} />)
    const input = await ready()
    fireEvent.change(input, { target: { value: '第一句' } })
    let pending!: Promise<boolean>
    act(() => { pending = ref.current!.flush() })
    fireEvent.change(input, { target: { value: '第二句' } })
    await act(async () => { release(); expect(await pending).toBe(true) })
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('第二句')
    expect((await db.dailyInspirations.get('2026-09-07'))?.revision).toBe(2)
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => { expect(await ref.current!.flush()).toBe(true) })
    expect(await db.dailyInspirations.get('2026-09-07')).toBeUndefined()
  })

  it('preserves local text on revision conflict and explicitly reloads the other version', async () => {
    await saveDailyInspiration(db, '2026-09-07', { content: {}, plainText: '初稿' }, 0, 1)
    const ref = createRef<DailyInspirationEditorHandle>()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" ref={ref} />)
    fireEvent.change(await ready(), { target: { value: '本页草稿' } })
    await saveDailyInspiration(db, '2026-09-07', { content: {}, plainText: '另一页' }, 1, 2)
    await act(async () => { expect(await ref.current!.flush()).toBe(false) })
    expect(screen.getByRole('textbox')).toHaveValue('本页草稿')
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('另一页')
    expect(screen.getByRole('button', { name: '导出本地草稿' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新载入当前版本' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('另一页'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not drain intermediate composition text when an earlier save finishes', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let count = 0
    const save: typeof saveDailyInspiration = async (...args) => { if (++count === 1) await gate; return saveDailyInspiration(...args) }
    const ref = createRef<DailyInspirationEditorHandle>()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" saveDailyInspiration={save} ref={ref} />)
    const input = await ready()
    fireEvent.change(input, { target: { value: '完成的句子' } })
    let pending!: Promise<boolean>
    act(() => { pending = ref.current!.flush() })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '完成的句子zhong' } })
    await act(async () => { release(); await pending })
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('完成的句子')
    fireEvent.change(input, { target: { value: '完成的句子中' } })
    fireEvent.compositionEnd(input)
    await act(async () => { expect(await ref.current!.flush()).toBe(true) })
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('完成的句子中')
  })

  it('protects a recovered draft whose base revision is stale', async () => {
    await saveDailyInspiration(db, '2026-09-07', { content: {}, plainText: '另一页已保存' }, 0, 1)
    localStorage.setItem(dailyDraftStorageKey('2026-09-07'), JSON.stringify({ plainText: '早期草稿', baseRevision: 0, updatedAt: 1 }))
    const ref = createRef<DailyInspirationEditorHandle>()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" ref={ref} />)
    expect(await ready()).toHaveValue('早期草稿')
    expect(screen.getByRole('alert')).toBeVisible()
    await act(async () => { expect(await ref.current!.flush()).toBe(false) })
    expect((await db.dailyInspirations.get('2026-09-07'))?.plainText).toBe('另一页已保存')
  })

  it('does not erase a newer recovery draft when an unmounted editor finishes saving', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const save: typeof saveDailyInspiration = async (...args) => { await gate; return saveDailyInspiration(...args) }
    const ref = createRef<DailyInspirationEditorHandle>()
    const first = render(<DailyInspirationEditor db={db} dateKey="2026-09-07" ref={ref} saveDailyInspiration={save} />)
    fireEvent.change(await ready(), { target: { value: '先前内容' } })
    let pending!: Promise<boolean>
    act(() => { pending = ref.current!.flush() })
    first.unmount()
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" />)
    fireEvent.change(await ready(), { target: { value: '新的未保存内容' } })
    await act(async () => { release(); await pending })
    expect(screen.getByRole('textbox')).toHaveValue('新的未保存内容')
    expect(localStorage.getItem(dailyDraftStorageKey('2026-09-07'))).toContain('新的未保存内容')
  })

  it('grows and shrinks with content and remeasures on viewport resize without internal scrolling', async () => {
    render(<DailyInspirationEditor db={db} dateKey="2026-09-07" />)
    const input = await ready()
    let height = 720
    Object.defineProperty(input, 'scrollHeight', { configurable: true, get: () => height })
    fireEvent.change(input, { target: { value: '长正文\n'.repeat(30) } })
    expect(input.style.height).toBe('720px')
    expect(input.style.overflow).toBe('hidden')
    height = 960
    fireEvent(window, new Event('resize'))
    expect(input.style.height).toBe('960px')
    height = 80
    fireEvent.change(input, { target: { value: '' } })
    expect(input.style.height).toBe('80px')
  })
})
