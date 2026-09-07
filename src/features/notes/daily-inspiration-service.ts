import type { VeloDB } from '../../db/velo-db'
import type { DailyInspiration } from '../../db/types'

export type DailyInspirationBody = {
  content: Record<string, unknown>
  plainText: string
}

type LocalDateParts = {
  year: number
  month: number
  day: number
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

export function parseLocalDateKey(dateKey: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error('日期无效')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) throw new Error('日期无效')
  const localNoon = localNoonDate(year, month - 1, day)
  if (localNoon.getFullYear() !== year || localNoon.getMonth() !== month - 1 || localNoon.getDate() !== day) {
    throw new Error('日期无效')
  }
  return { year, month, day }
}

export async function loadDailyInspiration(db: VeloDB, dateKey: string): Promise<DailyInspiration | undefined> {
  parseLocalDateKey(dateKey)
  return db.dailyInspirations.get(dateKey)
}

export async function listDailyInspirationDates(db: VeloDB, startKey: string, endKey: string): Promise<string[]> {
  parseLocalDateKey(startKey)
  parseLocalDateKey(endKey)
  if (startKey > endKey) throw new Error('日期范围无效')
  const rows = await db.dailyInspirations.where('dateKey').between(startKey, endKey, true, true).toArray()
  return rows.map((row) => row.dateKey)
}

export async function saveDailyInspiration(
  db: VeloDB,
  dateKey: string,
  input: DailyInspirationBody,
  expectedRevision: number,
  now: number,
): Promise<DailyInspiration | null> {
  parseLocalDateKey(dateKey)
  let saved: DailyInspiration | null = null
  await db.transaction('rw', db.dailyInspirations, db.appMeta, async () => {
    const existing = await db.dailyInspirations.get(dateKey)
    const markerKey = revisionMarkerKey(dateKey)
    const marker = await db.appMeta.get(markerKey)
    const markerRevision = marker ? Number(marker.value) : 0
    if (!Number.isInteger(markerRevision) || markerRevision < 0) throw new Error('灵感修订记录无效，请重新加载')

    if (existing ? existing.revision !== expectedRevision : expectedRevision !== 0) {
      throw new Error('灵感已被更新，请先重新加载')
    }

    if (input.plainText.trim() === '') {
      if (existing) {
        const revision = Math.max(existing.revision, markerRevision) + 1
        await db.dailyInspirations.delete(dateKey)
        await db.appMeta.put({ key: markerKey, value: String(revision), updatedAt: now })
      }
      return
    }

    const revision = existing ? Math.max(existing.revision, markerRevision) + 1 : markerRevision + 1
    saved = {
      dateKey,
      content: structuredContent(input.plainText),
      plainText: input.plainText,
      revision,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.dailyInspirations.put(saved)
    await db.appMeta.put({ key: markerKey, value: String(revision), updatedAt: now })
  })
  return saved
}

function localNoonDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0)
  date.setFullYear(year, monthIndex, day)
  date.setHours(12, 0, 0, 0)
  return date
}

function revisionMarkerKey(dateKey: string) {
  return `daily-inspiration-revision:${dateKey}`
}

function structuredContent(plainText: string): Record<string, unknown> {
  return {
    type: 'doc',
    version: 1,
    blocks: plainText.split('\n').map((text) => ({ type: 'paragraph', text })),
  }
}
