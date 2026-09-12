import type { VeloDB } from '@/db/velo-db'
import { createId } from '@/lib/create-id'

export interface FocusSession {
  id: string
  taskId: string | null
  title: string
  plannedMs: number
  startedAt: number
  status: 'running' | 'paused' | 'completed' | 'ended'
  segments: { start: number; end?: number }[]
  interruptions: number[]
}

export function elapsed(session: FocusSession, now: number) {
  return Math.min(session.plannedMs, session.segments.reduce((sum, part) => sum + Math.max(0, (part.end ?? now) - part.start), 0))
}

export async function startFocus(db: VeloDB, minutes: number, taskId: string | null, now = Date.now()) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('请输入 1–1440 的整数分钟')
  return db.transaction('rw', db.focusSessions, db.planTasks, async () => {
    const active = await db.focusSessions.where('status').anyOf('running', 'paused').first()
    if (active) return active.id
    const task = taskId ? await db.planTasks.get(taskId) : undefined
    if (taskId && !task) throw new Error('任务已不存在，请重新选择')
    const session: FocusSession = { id: createId(), taskId, title: task?.title ?? '自由专注', plannedMs: minutes * 60000, startedAt: now, status: 'running', segments: [{ start: now }], interruptions: [] }
    await db.focusSessions.add(session)
    return session.id
  })
}

export async function changeFocus(db: VeloDB, id: string, action: 'pause' | 'resume' | 'end' | 'tick', now = Date.now()) {
  return db.transaction('rw', db.focusSessions, async () => {
    const session = await db.focusSessions.get(id)
    if (!session || !['running', 'paused'].includes(session.status)) return
    const spent = elapsed(session, now)
    const last = session.segments.at(-1)!
    if (spent >= session.plannedMs) {
      if (last.end === undefined) {
        const previous = session.segments.slice(0, -1).reduce((sum, part) => sum + Math.max(0, part.end! - part.start), 0)
        last.end = last.start + Math.max(0, session.plannedMs - previous)
      }
      session.status = 'completed'
    } else if (action === 'pause' && session.status === 'running') {
      last.end = Math.max(last.start, now)
      session.interruptions.push(now)
      session.status = 'paused'
    } else if (action === 'resume' && session.status === 'paused') {
      session.segments.push({ start: Math.max(last.end!, now) })
      session.status = 'running'
    } else if (action === 'end') {
      if (last.end === undefined) last.end = Math.max(last.start, now)
      session.status = 'ended'
    } else return
    await db.focusSessions.put(session)
  })
}

export function dayStats(sessions: FocusSession[], date: Date, now: number) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  let duration = 0
  let interruptions = 0
  const records: { session: FocusSession; duration: number }[] = []
  for (const session of sessions) {
    let remaining = session.plannedMs
    let daily = 0
    for (const part of session.segments) {
      const stop = Math.min(part.end ?? now, part.start + remaining)
      daily += Math.max(0, Math.min(stop, end) - Math.max(part.start, start))
      remaining -= Math.max(0, stop - part.start)
    }
    duration += daily
    interruptions += session.interruptions.filter(time => time >= start && time < end).length
    if (daily > 0) records.push({ session, duration: daily })
  }
  return { duration, interruptions, records }
}
