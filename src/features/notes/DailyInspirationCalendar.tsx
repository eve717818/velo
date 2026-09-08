import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { adjacentMonth, calendarGrid, offsetDateKey, type CalendarMonth } from './daily-inspiration-state'
import { localDateKey, parseLocalDateKey } from './daily-inspiration-service'
import styles from './NotesWorkspace.module.css'

interface DailyInspirationCalendarProps {
  selectedDateKey: string
  visibleMonth: CalendarMonth
  contentDateKeys: ReadonlySet<string>
  onSelectDate: (dateKey: string) => void
  onVisibleMonthChange: (month: CalendarMonth) => void
}

export function DailyInspirationCalendar({ selectedDateKey, visibleMonth, contentDateKeys, onSelectDate, onVisibleMonthChange }: DailyInspirationCalendarProps) {
  const [yearInput, setYearInput] = useState<{ year: number; text: string } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const today = localDateKey(new Date())
  const cells = calendarGrid(visibleMonth.year, visibleMonth.monthIndex)
  const previous = adjacentMonth(visibleMonth, -1)
  const next = adjacentMonth(visibleMonth, 1)

  useLayoutEffect(() => {
    if (pendingFocus.current && pendingFocus.current === selectedDateKey) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${selectedDateKey}"]`)?.focus()
      pendingFocus.current = null
    }
  }, [selectedDateKey, visibleMonth])

  function select(dateKey: string) {
    const parts = parseLocalDateKey(dateKey)
    onSelectDate(dateKey)
    if (parts.year !== visibleMonth.year || parts.month - 1 !== visibleMonth.monthIndex) {
      onVisibleMonthChange({ year: parts.year, monthIndex: parts.month - 1 })
    }
  }

  function onDateKeyDown(event: KeyboardEvent<HTMLButtonElement>, dateKey: string) {
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number | undefined>)[event.key]
    if (offset === undefined) return
    event.preventDefault()
    const target = offsetDateKey(dateKey, offset)
    if (target) { pendingFocus.current = target; select(target) }
  }

  return <section className={styles.dailyCalendar} aria-label="灵感日历">
    <div className={styles.dailyCalendarControls}>
      <button type="button" aria-label="上个月" disabled={!previous} onClick={() => previous && onVisibleMonthChange(previous)}><ChevronLeft aria-hidden="true" size={18} /></button>
      <input aria-label="年份" type="number" min={1} max={9999} inputMode="numeric"
        value={yearInput?.year === visibleMonth.year ? yearInput.text : visibleMonth.year}
        onBlur={() => setYearInput(null)}
        onChange={(event) => {
          const text = event.target.value
          const year = Number(text)
          if (Number.isInteger(year) && year >= 1 && year <= 9999) {
            setYearInput(null)
            onVisibleMonthChange({ year, monthIndex: visibleMonth.monthIndex })
          } else setYearInput({ year: visibleMonth.year, text })
        }} />
      <select aria-label="月份" value={visibleMonth.monthIndex} onChange={(event) => onVisibleMonthChange({ year: visibleMonth.year, monthIndex: Number(event.target.value) })}>
        {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{index + 1}月</option>)}
      </select>
      <button type="button" aria-label="下个月" disabled={!next} onClick={() => next && onVisibleMonthChange(next)}><ChevronRight aria-hidden="true" size={18} /></button>
      <button type="button" className={styles.dailyTodayButton} onClick={() => select(today)}>今天</button>
    </div>
    <div className={styles.dailyWeekdays} aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className={styles.dailyDateGrid} role="group" aria-label="日期" ref={gridRef}
      onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
      onPointerDown={(event) => {
        suppressClick.current = false
        if (event.button !== 0 || event.isPrimary === false) return
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerCancel={() => { gesture.current = null }}
      onPointerUp={(event) => {
        const start = gesture.current
        gesture.current = null
        if (!start || start.id !== event.pointerId) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
        suppressClick.current = true
        const month = dx < 0 ? next : previous
        if (month) onVisibleMonthChange(month)
      }}>
      {cells.map((cell) => {
        const [year, month] = cell.dateKey.split('-').map(Number)
        const hasContent = contentDateKeys.has(cell.dateKey)
        return <button key={cell.dateKey} type="button" disabled={!cell.supported}
          data-date-key={cell.dateKey} data-outside-month={!cell.inMonth} data-supported={cell.supported}
          aria-label={`${year}年${month}月${cell.day}日${hasContent ? '，有灵感' : ''}`}
          aria-pressed={cell.dateKey === selectedDateKey} aria-current={cell.dateKey === today ? 'date' : undefined}
          onClick={() => select(cell.dateKey)} onKeyDown={(event) => onDateKeyDown(event, cell.dateKey)}>
          <span>{cell.day}</span>{hasContent ? <i className={styles.dailyContentDot} aria-hidden="true" /> : null}
        </button>
      })}
    </div>
  </section>
}
