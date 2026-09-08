import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyInspirationCalendar } from './DailyInspirationCalendar'
import { calendarGrid, type CalendarMonth } from './daily-inspiration-state'

function Calendar({ date = '2028-02-29', month = { year: 2028, monthIndex: 1 } }: { date?: string; month?: CalendarMonth }) {
  const [selected, select] = useState(date)
  const [visible, show] = useState(month)
  return <DailyInspirationCalendar selectedDateKey={selected} visibleMonth={visible} contentDateKeys={new Set(['2028-02-29'])} onSelectDate={select} onVisibleMonthChange={show} />
}

afterEach(() => vi.useRealTimers())

describe('DailyInspirationCalendar', () => {
  it('renders 42 local dates, leap day content, selected state and quiet adjacent months', () => {
    render(<Calendar />)
    expect(within(screen.getByRole('group', { name: '日期' })).getAllByRole('button')).toHaveLength(42)
    const leapDay = screen.getByRole('button', { name: '2028年2月29日，有灵感' })
    expect(leapDay).toHaveAttribute('aria-pressed', 'true')
    expect(leapDay.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2028年1月31日' })).toHaveAttribute('data-outside-month', 'true')
    expect(calendarGrid(2028, 1)[0].dateKey).toBe('2028-01-31')
  })

  it('crosses years and accepts direct early years and all twelve months', async () => {
    const user = userEvent.setup()
    render(<Calendar date="2026-12-31" month={{ year: 2026, monthIndex: 11 }} />)
    await user.click(screen.getByRole('button', { name: '下个月' }))
    expect(screen.getByRole('spinbutton', { name: '年份' })).toHaveValue(2027)
    expect(screen.getByRole('combobox', { name: '月份' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: '上个月' }))
    expect(screen.getByRole('spinbutton', { name: '年份' })).toHaveValue(2026)
    fireEvent.change(screen.getByRole('spinbutton', { name: '年份' }), { target: { value: '4' } })
    await user.selectOptions(screen.getByRole('combobox', { name: '月份' }), '1')
    expect(screen.getByRole('button', { name: '4年2月29日' })).toBeInTheDocument()
  })

  it('keeps invalid years out of navigation and bounds the supported calendar', () => {
    const { rerender } = render(<Calendar key="first" date="0001-01-01" month={{ year: 1, monthIndex: 0 }} />)
    expect(calendarGrid(1, 0)).toHaveLength(42)
    expect(screen.getByRole('button', { name: '上个月' })).toBeDisabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: '年份' }), { target: { value: '0' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: '年份' }))
    expect(screen.getByRole('spinbutton', { name: '年份' })).toHaveValue(1)
    rerender(<Calendar key="last" date="9999-12-31" month={{ year: 9999, monthIndex: 11 }} />)
    expect(calendarGrid(9999, 11)).toHaveLength(42)
    expect(screen.getByRole('button', { name: '下个月' })).toBeDisabled()
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('data-supported') === 'false').every((button) => button.hasAttribute('disabled'))).toBe(true)
  })

  it('returns to local today and exposes today separately from selection', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 23, 30))
    render(<Calendar />)
    fireEvent.click(screen.getByRole('button', { name: '今天' }))
    const today = screen.getByRole('button', { name: '2026年9月7日' })
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves keyboard focus and selection across month boundaries and weeks', async () => {
    render(<Calendar />)
    const leapDay = screen.getByRole('button', { name: '2028年2月29日，有灵感' })
    leapDay.focus()
    fireEvent.keyDown(leapDay, { key: 'ArrowRight' })
    const march = await screen.findByRole('button', { name: '2028年3月1日' })
    expect(march).toHaveFocus()
    expect(march).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(march, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: '2028年2月23日' })).toHaveFocus()
  })

  it('changes one month for a horizontal swipe but ignores vertical, short and cancelled gestures', () => {
    render(<Calendar />)
    const grid = screen.getByRole('group', { name: '日期' })
    const swipe = (x: number, y: number, cancel = false) => {
      // jsdom has no PointerEvent constructor; retain coordinates and identity explicitly.
      const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 100, button: 0 })
      const up = new MouseEvent(cancel ? 'pointercancel' : 'pointerup', { bubbles: true, clientX: x, clientY: y })
      Object.defineProperty(down, 'pointerId', { value: 1 })
      Object.defineProperty(up, 'pointerId', { value: 1 })
      fireEvent(grid, down)
      fireEvent(grid, up)
    }
    swipe(190, 101)
    swipe(100, 240)
    swipe(100, 105, true)
    expect(screen.getByRole('combobox', { name: '月份' })).toHaveValue('1')
    swipe(100, 105)
    expect(screen.getByRole('combobox', { name: '月份' })).toHaveValue('2')
    swipe(290, 105)
    expect(screen.getByRole('combobox', { name: '月份' })).toHaveValue('1')
  })

  it('keeps the 390px and 402px phone layouts writing-first without shrinking touch targets', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/features/notes/NotesWorkspace.module.css'), 'utf8')
    const mobileStart = css.indexOf('@media (max-width: 767px)')
    const mobileEnd = css.indexOf('@media (min-width: 768px)', mobileStart)
    const mobileCss = css.slice(mobileStart, mobileEnd)
    const calendarPadding = mobileCss.match(/\.dailyCalendar\s*{[^}]*padding:\s*(\d+)px\s+(\d+)px\s+(\d+)(?:px)?/s)
    const weekdayHeight = mobileCss.match(/\.dailyWeekdays span\s*{[^}]*line-height:\s*(\d+)px/s)
    const gridMetrics = mobileCss.match(/\.dailyDateGrid\s*{[^}]*grid-auto-rows:\s*(\d+)px[^}]*padding-block:\s*(\d+)px/s)
    const paperMinimum = mobileCss.match(/\.dailyText\s*{[^}]*min-height:\s*max\((\d+)px,\s*(\d+)dvh\)/s)

    expect(css).toMatch(/\.dailyCalendarControls button,[\s\S]*?min-height:\s*44px;[\s\S]*?min-width:\s*44px;/)
    expect(css).toMatch(/\.dailyDateGrid button\s*{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s)
    expect(calendarPadding, 'phone calendar padding must be explicit').not.toBeNull()
    expect(weekdayHeight, 'phone weekday row must be compact').not.toBeNull()
    expect(gridMetrics, 'phone date tracks must be compact while buttons stay 44px').not.toBeNull()
    expect(paperMinimum, 'phone paper must retain the dominant share').not.toBeNull()
    if (!calendarPadding || !weekdayHeight || !gridMetrics || !paperMinimum) return

    const [, paddingTop, paddingInline, paddingBottom] = calendarPadding.map(Number)
    const [, weekday, dateTrack, gridPadding, paperPixels, paperDvh] = [
      0,
      Number(weekdayHeight[1]),
      Number(gridMetrics[1]),
      Number(gridMetrics[2]),
      Number(paperMinimum[1]),
      Number(paperMinimum[2]),
    ]
    const calendarHeight = paddingTop + 44 + weekday + dateTrack * 6 + gridPadding * 2 + paddingBottom

    for (const { width, height } of [{ width: 390, height: 844 }, { width: 402, height: 874 }]) {
      expect((width - paddingInline * 2) / 7).toBeGreaterThanOrEqual(44)
      const paperHeight = Math.max(paperPixels, height * paperDvh / 100)
      expect(calendarHeight / (calendarHeight + paperHeight)).toBeLessThanOrEqual(0.36)
    }
  })
})
