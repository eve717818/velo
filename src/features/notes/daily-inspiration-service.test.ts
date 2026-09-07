import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { VeloDB } from '../../db/velo-db'
import {
  listDailyInspirationDates,
  loadDailyInspiration,
  localDateKey,
  parseLocalDateKey,
  saveDailyInspiration,
} from './daily-inspiration-service'

const databases: VeloDB[] = []

function createDb() {
  const db = new VeloDB(`daily-inspiration-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}

function body(plainText: string, content: Record<string, unknown> = { type: 'unexpected' }) {
  return { content, plainText }
}

function localDate(year: number, monthIndex: number, day: number, hour = 12) {
  const date = new Date(0)
  date.setFullYear(year, monthIndex, day)
  date.setHours(hour, 0, 0, 0)
  return date
}

const emptyBody = body('')

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    db.close()
    await db.delete()
  }))
})

describe('daily inspiration service', () => {
  test('uses local calendar fields instead of UTC conversion', () => {
    const localLateNight = new Date(2026, 8, 7, 23, 45)

    expect(localDateKey(localLateNight)).toBe('2026-09-07')
  })

  test('parses only real local calendar dates, including leap day', () => {
    expect(parseLocalDateKey('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 })
    expect(parseLocalDateKey('0096-02-29')).toEqual({ year: 96, month: 2, day: 29 })
    expect(parseLocalDateKey('0099-02-28')).toEqual({ year: 99, month: 2, day: 28 })
    expect(() => parseLocalDateKey('2027-02-29')).toThrow('日期无效')
    expect(() => parseLocalDateKey('0099-02-29')).toThrow('日期无效')
    expect(() => parseLocalDateKey('0000-01-01')).toThrow('日期无效')
    expect(() => parseLocalDateKey('10000-01-01')).toThrow('日期无效')
    expect(() => parseLocalDateKey('2026-2-03')).toThrow('日期无效')
    expect(() => parseLocalDateKey('2026-13-01')).toThrow('日期无效')
  })

  test('roundtrips early local years without JavaScript’s 1900 offset', () => {
    expect(localDateKey(localDate(99, 0, 2, 23))).toBe('0099-01-02')
    expect(localDateKey(localDate(1, 11, 31))).toBe('0001-12-31')
  })

  test('does not create an empty day and deletes a cleared existing day', async () => {
    const db = createDb()

    await expect(saveDailyInspiration(db, '2026-09-07', emptyBody, 0, 1)).resolves.toBeNull()
    expect(await db.dailyInspirations.count()).toBe(0)

    const saved = await saveDailyInspiration(db, '2026-09-07', body('一条灵感'), 0, 2)
    expect(saved).toMatchObject({ dateKey: '2026-09-07', revision: 1, createdAt: 2, updatedAt: 2 })

    await expect(saveDailyInspiration(db, '2026-09-07', emptyBody, 1, 3)).resolves.toBeNull()
    expect(await db.dailyInspirations.count()).toBe(0)
  })

  test('writes structured content from plain text so both representations agree', async () => {
    const db = createDb()

    const saved = await saveDailyInspiration(db, '2026-09-07', body('第一行\n第二行'), 0, 10)

    expect(saved).toMatchObject({
      plainText: '第一行\n第二行',
      content: {
        type: 'doc',
        version: 1,
        blocks: [
          { type: 'paragraph', text: '第一行' },
          { type: 'paragraph', text: '第二行' },
        ],
      },
    })
    await expect(loadDailyInspiration(db, '2026-09-07')).resolves.toEqual(saved)
  })

  test('lists only dates in an inclusive month range', async () => {
    const db = createDb()
    await saveDailyInspiration(db, '2026-08-31', body('八月'), 0, 1)
    await saveDailyInspiration(db, '2026-09-01', body('九月一日'), 0, 2)
    await saveDailyInspiration(db, '2026-09-30', body('九月末'), 0, 3)
    await saveDailyInspiration(db, '2026-10-01', body('十月'), 0, 4)

    await expect(listDailyInspirationDates(db, '2026-09-01', '2026-09-30')).resolves.toEqual([
      '2026-09-01',
      '2026-09-30',
    ])
  })

  test('starts at revision one and rejects stale saves without overwriting content', async () => {
    const db = createDb()
    const original = await saveDailyInspiration(db, '2026-09-07', body('原稿'), 0, 1)

    expect(original?.revision).toBe(1)
    await expect(saveDailyInspiration(db, '2026-09-07', body('旧稿'), 0, 2)).rejects.toThrow('灵感已被更新，请先重新加载')
    await expect(loadDailyInspiration(db, '2026-09-07')).resolves.toMatchObject({ plainText: '原稿', revision: 1 })
  })

  test('keeps a date generation across deletion so stale revision-one tabs cannot write an ABA date', async () => {
    const db = createDb()
    const dateKey = '2026-09-07'
    const first = await saveDailyInspiration(db, dateKey, body('第一稿'), 0, 1)

    await expect(saveDailyInspiration(db, dateKey, emptyBody, first?.revision ?? 0, 2)).resolves.toBeNull()
    expect(await db.dailyInspirations.count()).toBe(0)
    expect(await listDailyInspirationDates(db, dateKey, dateKey)).toEqual([])
    expect(await db.appMeta.get(`daily-inspiration-revision:${dateKey}`)).toBeDefined()

    await expect(saveDailyInspiration(db, dateKey, body('过期写入'), 1, 3)).rejects.toThrow('灵感已被更新')
    await expect(saveDailyInspiration(db, dateKey, emptyBody, 1, 3)).rejects.toThrow('灵感已被更新')

    const recreated = await saveDailyInspiration(db, dateKey, body('重建稿'), 0, 4)
    expect(recreated?.revision).toBeGreaterThan(first?.revision ?? 0)
  })

  test('does not create a revision marker for a never-written empty date', async () => {
    const db = createDb()
    const dateKey = '2026-09-08'

    await expect(saveDailyInspiration(db, dateKey, emptyBody, 0, 1)).resolves.toBeNull()
    await expect(db.appMeta.get(`daily-inspiration-revision:${dateKey}`)).resolves.toBeUndefined()
  })
})
