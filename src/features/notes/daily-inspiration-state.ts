import { localDateKey, parseLocalDateKey } from './daily-inspiration-service'

export interface CalendarMonth { year: number; monthIndex: number }
export interface CalendarCell {
  dateKey: string
  day: number
  inMonth: boolean
  supported: boolean
}

function localNoon(year: number, monthIndex: number, day: number) {
  const date = new Date(0)
  date.setFullYear(year, monthIndex, day)
  date.setHours(12, 0, 0, 0)
  return date
}

export function calendarGrid(year: number, monthIndex: number): CalendarCell[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('年月无效')
  }
  const first = localNoon(year, monthIndex, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = localNoon(year, monthIndex, index + 1 - offset)
    return {
      dateKey: localDateKey(date),
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
      supported: date.getFullYear() >= 1 && date.getFullYear() <= 9999,
    }
  })
}

export function adjacentMonth(month: CalendarMonth, delta: number): CalendarMonth | null {
  const date = localNoon(month.year, month.monthIndex + delta, 1)
  const year = date.getFullYear()
  return year >= 1 && year <= 9999 ? { year, monthIndex: date.getMonth() } : null
}

export function offsetDateKey(dateKey: string, days: number): string | null {
  const { year, month, day } = parseLocalDateKey(dateKey)
  const date = localNoon(year, month - 1, day + days)
  return date.getFullYear() >= 1 && date.getFullYear() <= 9999 ? localDateKey(date) : null
}

export interface DailyDraft { plainText: string; baseRevision: number; updatedAt: number }
export function dailyDraftStorageKey(dateKey: string) { return `velow-daily-draft:${dateKey}` }

export function readDailyDraft(dateKey: string): DailyDraft | null {
  try {
    const raw = localStorage.getItem(dailyDraftStorageKey(dateKey))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<DailyDraft> | null
    if (!draft || typeof draft.plainText !== 'string' || !Number.isInteger(draft.baseRevision) || Number(draft.baseRevision) < 0) return null
    return { plainText: draft.plainText, baseRevision: Number(draft.baseRevision), updatedAt: Number(draft.updatedAt) || 0 }
  } catch { return null }
}

export function writeDailyDraft(dateKey: string, draft: DailyDraft) {
  try { localStorage.setItem(dailyDraftStorageKey(dateKey), JSON.stringify(draft)) } catch {
    // The current editor keeps the draft available if storage is restricted.
  }
}

export function clearDailyDraft(dateKey: string) {
  try { localStorage.removeItem(dailyDraftStorageKey(dateKey)) } catch {
    // An undeletable recovery draft is revalidated against its base revision on load.
  }
}
