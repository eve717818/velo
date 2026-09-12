import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { veloDb, type VeloDB } from '@/db/velo-db'
import { changeFocus, dayStats, elapsed, startFocus } from '@/features/focus/focus-service'
import { readFocusMinutes } from '@/features/plans/focus-link'
import { calendarGrid, adjacentMonth } from '@/features/notes/daily-inspiration-state'
import styles from './FocusPage.module.css'

const duration = (ms: number) => `${Math.floor(ms / 3600000)}小时 ${Math.floor(ms / 60000) % 60}分`

export function FocusPage({ db = veloDb }: { db?: VeloDB }) {
  const [params] = useSearchParams()
  const [taskId, setTaskId] = useState(params.get('task') ?? '')
  const [minutes, setMinutes] = useState(String(readFocusMinutes(params.get('minutes'))))
  const [linking, setLinking] = useState(false)
  const [history, setHistory] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [date, setDate] = useState(() => new Date())
  const [month, setMonth] = useState(() => ({ year: date.getFullYear(), monthIndex: date.getMonth() }))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const data = useLiveQuery(async () => {
    try { return { sessions: await db.focusSessions.toArray(), tasks: await db.planTasks.toArray(), error: '' } }
    catch { return { sessions: [], tasks: [], error: '心流数据读取失败，请刷新后重试。' } }
  }, [db])
  const sessions = data?.sessions ?? []
  const active = sessions.find(item => item.status === 'running' || item.status === 'paused')
  const task = data?.tasks.find(item => item.id === taskId)
  const planned = active?.plannedMs ?? (Number(minutes) || 25) * 60000
  const spent = active ? elapsed(active, now) : 0
  const seconds = Math.max(0, Math.ceil((planned - spent) / 1000))
  const selected = dayStats(sessions, history ? date : new Date(now), now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  useEffect(() => {
    if (active?.status === 'running' && spent >= planned) void changeFocus(db, active.id, 'tick', now).then(() => setMessage('本次心流已完成，时间已保存。')).catch(() => setMessage('保存失败，请重试。'))
  }, [active?.id, active?.status, spent, planned, db, now])
  async function act(action: 'start' | 'pause' | 'resume' | 'end') {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      if (action === 'start') await startFocus(db, Number(minutes), taskId || null)
      else if (active) await changeFocus(db, active.id, action)
      if (action === 'end') setMessage('心流时间已保存，关联任务的完成状态保持不变。')
      setNow(Date.now())
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>保持心流</h1><p>专注学习</p></div><button aria-pressed={history} onClick={() => setHistory(!history)}>{history ? '返回专注' : '心流时间'}</button></header>
    {!data && <p role="status">正在读取心流时间…</p>}
    {(message || data?.error) && <p role="status">{message || data?.error}</p>}
    {history ? <>
      <section className={styles.stats} aria-label="累计心流时间"><div><small>累计时长</small><strong>{duration(sessions.reduce((sum, item) => sum + elapsed(item, now), 0))}</strong></div><div><small>中断次数</small><strong>{sessions.reduce((sum, item) => sum + item.interruptions.length, 0)}次</strong></div></section>
      <section className={styles.surface} aria-label="心流月历"><div className={styles.month}>
        <button aria-label="上个月" disabled={!adjacentMonth(month, -1)} onClick={() => setMonth(adjacentMonth(month, -1)!)}>‹</button>
        <input aria-label="年份" type="number" min="1" max="9999" value={month.year} onChange={event => { const year = Number(event.target.value); if (Number.isInteger(year) && year >= 1 && year <= 9999) setMonth({ ...month, year }) }} />
        <select aria-label="月份" value={month.monthIndex} onChange={event => setMonth({ ...month, monthIndex: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{index + 1}月</option>)}</select>
        <button aria-label="下个月" disabled={!adjacentMonth(month, 1)} onClick={() => setMonth(adjacentMonth(month, 1)!)}>›</button>
      </div><div className={styles.grid}>{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}{calendarGrid(month.year, month.monthIndex).map(cell => {
        if (!cell.inMonth) return <span key={cell.dateKey} />
        const target = new Date(`${cell.dateKey}T12:00:00`)
        const hasRecord = dayStats(sessions, target, now).duration > 0
        return <button key={cell.dateKey} aria-label={`${cell.dateKey}${hasRecord ? '，有心流记录' : ''}`} aria-pressed={target.toDateString() === date.toDateString()} onClick={() => setDate(target)}>{cell.day}{hasRecord && <i />}</button>
      })}</div></section>
      <section className={styles.surface}><h2>{date.getMonth() + 1}月{date.getDate()}日</h2><p>{duration(selected.duration)} · 中断 {selected.interruptions} 次</p>{selected.records.length ? selected.records.map(({ session, duration: time }) => <article key={session.id}><strong>{session.title}</strong><span>{duration(time)} · {session.status === 'running' ? '进行中' : session.status === 'paused' ? '已暂停' : '已记录'}</span></article>) : <p>这一天还没有心流记录</p>}</section>
    </> : <>
      <section className={styles.surface} aria-label="专注计时">
        <div className={styles.task}><strong>{active?.title ?? task?.title ?? '自由专注'}</strong>{!active && <button aria-expanded={linking} onClick={() => setLinking(!linking)}>关联任务</button>}</div>
        {!active && linking && <label className={styles.picker}>选择学习任务<select aria-label="关联学习任务" value={taskId} onChange={event => { setTaskId(event.target.value); const selectedTask = data?.tasks.find(item => item.id === event.target.value); if (selectedTask) setMinutes(String(readFocusMinutes(String(selectedTask.estimatedMinutes ?? 25)))) }}><option value="">不关联 · 自由专注</option>{data?.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
        {!active && taskId && !task && data && <p role="alert">关联任务已不存在，请重新选择任务或自由专注。</p>}
        <div className={styles.timer} data-running={active?.status === 'running'}><svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="110" /><circle cx="120" cy="120" r="110" strokeDasharray="691.15" strokeDashoffset={691.15 * (spent / planned)} /></svg><div><span aria-label="剩余时间">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span><small>{active?.status === 'paused' ? '稍作停留，再继续' : active ? '此刻，只做这一件事' : '给自己一段安静的时间'}</small></div></div>
        {!active && <><div className={styles.durations}>{[25, 45, 60].map(value => <button key={value} aria-pressed={minutes === String(value)} onClick={() => setMinutes(String(value))}>{value} 分钟</button>)}</div><label className={styles.custom}>自定义时长<input aria-label="自定义分钟" type="number" min="1" max="1440" value={minutes} onChange={event => setMinutes(event.target.value)} />分钟</label></>}
        <div className={styles.actions}>{!active ? <button className={styles.start} disabled={busy || !data || !!data.error || (!!taskId && !task)} onClick={() => void act('start')}>开始专注</button> : <><button className={styles.pause} disabled={busy} onClick={() => void act(active.status === 'paused' ? 'resume' : 'pause')}>{active.status === 'paused' ? '继续' : '暂停'}</button><button disabled={busy} onClick={() => void act('end')}>结束</button></>}</div>
        {active && <p className={styles.hint}>本次中断 {active.interruptions.length} 次 · {active.taskId ? '已关联任务' : '自由专注'}</p>}
      </section>
      <section className={styles.stats} aria-label="今日心流"><div><small>今日心流</small><strong>{duration(selected.duration)}</strong></div><div><small>中断次数</small><strong>{selected.interruptions}次</strong></div></section>
    </>}
  </main>
}
