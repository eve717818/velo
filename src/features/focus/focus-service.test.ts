import { afterEach, describe, expect, it } from 'vitest'
import { VeloDB } from '@/db/velo-db'
import { changeFocus, dayStats, elapsed, startFocus } from './focus-service'

const databases: VeloDB[] = []
function database() { const db = new VeloDB(`focus-test-${crypto.randomUUID()}`); databases.push(db); return db }
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })

describe('focus timing', () => {
  it('excludes paused time and ignores duplicate pause/end actions', async () => {
    const db = database()
    const id = await startFocus(db, 25, null, 1000)
    await changeFocus(db, id, 'pause', 61000)
    await changeFocus(db, id, 'pause', 62000)
    await changeFocus(db, id, 'resume', 121000)
    await changeFocus(db, id, 'end', 181000)
    await changeFocus(db, id, 'end', 200000)
    const session = (await db.focusSessions.get(id))!
    expect(elapsed(session, 999999)).toBe(120000)
    expect(session.interruptions).toEqual([61000])
  })
  it('allows only one active session across competing starts', async () => {
    const db = database()
    const ids = await Promise.all([startFocus(db, 25, null, 0), startFocus(db, 45, null, 0)])
    expect(new Set(ids).size).toBe(1)
    expect(await db.focusSessions.count()).toBe(1)
  })
  it('recovers from reload and caps overdue sessions at their target time', async () => {
    const db = database()
    const id = await startFocus(db, 1, null, 1000)
    db.close(); await db.open()
    await changeFocus(db, id, 'tick', 999999)
    const session = (await db.focusSessions.get(id))!
    expect(session.status).toBe('completed')
    expect(session.segments).toEqual([{ start: 1000, end: 61000 }])
    expect(session.interruptions).toHaveLength(0)
  })
  it('splits time at local midnight', async () => {
    const db = database()
    const start = new Date(2026, 8, 12, 23, 59).getTime()
    const id = await startFocus(db, 25, null, start)
    await changeFocus(db, id, 'end', start + 180000)
    const rows = await db.focusSessions.toArray()
    expect(dayStats(rows, new Date(2026, 8, 12), start + 180000).duration).toBe(60000)
    expect(dayStats(rows, new Date(2026, 8, 13), start + 180000).duration).toBe(120000)
  })
  it('rejects invalid durations and missing tasks without writing data', async () => {
    const db = database()
    await expect(startFocus(db, 0, null)).rejects.toThrow()
    await expect(startFocus(db, 1.5, null)).rejects.toThrow()
    await expect(startFocus(db, 25, 'missing')).rejects.toThrow()
    expect(await db.focusSessions.count()).toBe(0)
  })
})
