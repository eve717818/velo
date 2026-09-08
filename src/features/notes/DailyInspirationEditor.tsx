import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { VeloDB } from '@/db/velo-db'
import { loadDailyInspiration, saveDailyInspiration as saveService } from './daily-inspiration-service'
import { clearDailyDraft, readDailyDraft, writeDailyDraft } from './daily-inspiration-state'
import styles from './NotesWorkspace.module.css'

export interface DailyInspirationEditorHandle { focus: () => void; flush: () => Promise<boolean> }
interface DailyInspirationEditorProps { db: VeloDB; dateKey: string; saveDailyInspiration?: typeof saveService }
interface Session {
  db: VeloDB
  dateKey: string
  text: string
  revision: number
  dirty: boolean
  conflict: boolean
  inFlight: Promise<boolean> | null
}

export const DailyInspirationEditor = forwardRef<DailyInspirationEditorHandle, DailyInspirationEditorProps>(function DailyInspirationEditor(
  { db, dateKey, saveDailyInspiration = saveService }, ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const composingRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const mounted = useRef(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [reload, setReload] = useState(0)
  const errorId = useId()
  const focusRequested = useRef(false)

  const remember = useCallback((session: Session) => {
    writeDailyDraft(session.dateKey, { plainText: session.text, baseRevision: session.revision, updatedAt: Date.now() })
  }, [])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    const session = sessionRef.current
    if (!session || composingRef.current || session.conflict) return false
    while (session.dirty) {
      if (composingRef.current || session.conflict) return false
      if (session.inFlight) {
        if (!await session.inFlight) return false
        continue
      }
      const snapshot = { text: session.text, revision: session.revision }
      const operation = (async () => {
        try {
          const saved = await saveDailyInspiration(session.db, session.dateKey, { plainText: snapshot.text, content: {} }, snapshot.revision, Date.now())
          const stored = readDailyDraft(session.dateKey)
          const ownsDraft = stored?.plainText === session.text && stored.baseRevision === snapshot.revision
          session.revision = saved?.revision ?? 0
          session.dirty = session.text !== snapshot.text
          if (ownsDraft) {
            if (session.dirty) remember(session)
            else clearDailyDraft(session.dateKey)
          }
          if (mounted.current && sessionRef.current === session) { setError(''); setConflict(false) }
          return true
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : '保存失败，请重试'
          session.conflict = message.includes('先重新加载')
          if (mounted.current && sessionRef.current === session) { setError(message); setConflict(session.conflict) }
          return false
        }
      })()
      session.inFlight = operation
      const success = await operation
      session.inFlight = null
      if (!success) return false
    }
    return true
  }, [remember, saveDailyInspiration])

  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    if (!composingRef.current && !sessionRef.current?.conflict) timerRef.current = window.setTimeout(() => void flush(), 320)
  }, [flush])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function openDate() {
      const current = sessionRef.current
      if (current?.dateKey === dateKey && current.db === db) return
      setLoading(true)
      if (current && !await flush()) {
        if (!cancelled) setLoading(false)
        return
      }
      if (cancelled) return
      try {
        const loaded = await loadDailyInspiration(db, dateKey)
        if (cancelled) return
        const draft = readDailyDraft(dateKey)
        const revision = loaded?.revision ?? 0
        const hasConflict = !!draft && draft.baseRevision !== revision
        const nextText = draft?.plainText ?? loaded?.plainText ?? ''
        sessionRef.current = { db, dateKey, text: nextText, revision: draft?.baseRevision ?? revision, dirty: !!draft, conflict: hasConflict, inFlight: null }
        setText(nextText)
        setConflict(hasConflict)
        setError(hasConflict ? '本地草稿基于较早版本，请导出草稿或重新载入当前版本。' : '')
        setLoading(false)
        if (draft && !hasConflict) schedule()
      } catch (reason) {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : '灵感加载失败，请重试')
        setLoading(false)
      }
    }
    void openDate()
    return () => { cancelled = true }
  }, [dateKey, db, flush, reload, schedule])

  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])
  useLayoutEffect(() => { resize() }, [text, resize])
  useEffect(() => {
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    if (textareaRef.current?.parentElement) observer?.observe(textareaRef.current.parentElement)
    return () => { window.removeEventListener('resize', resize); observer?.disconnect() }
  }, [resize])
  useEffect(() => {
    if (!loading && focusRequested.current) { textareaRef.current?.focus(); focusRequested.current = false }
  }, [loading])
  useImperativeHandle(ref, () => ({
    flush,
    focus: () => { focusRequested.current = loading; if (!loading) textareaRef.current?.focus() },
  }), [flush, loading])

  function updateDraft(value: string) {
    const session = sessionRef.current
    if (!session || loading) return
    session.text = value
    session.dirty = true
    setText(value)
    remember(session)
    schedule()
  }

  async function retry() {
    if (!sessionRef.current || await flush()) setReload((value) => value + 1)
  }

  async function reloadCurrent() {
    const session = sessionRef.current
    if (!session || session.inFlight) return
    // Only discard the local draft after the current database version was read successfully.
    try {
      const loaded = await loadDailyInspiration(session.db, session.dateKey)
      if (sessionRef.current !== session || !mounted.current) return
      clearDailyDraft(session.dateKey)
      session.text = loaded?.plainText ?? ''
      session.revision = loaded?.revision ?? 0
      session.dirty = false
      session.conflict = false
      setText(session.text)
      setConflict(false)
      setError('')
      setReload((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '重新载入失败') }
  }

  function exportDraft() {
    const session = sessionRef.current
    if (!session) return
    const url = URL.createObjectURL(new Blob([session.text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${session.dateKey}-本地草稿.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className={styles.dailyEditor} aria-label="灵感编辑器" aria-busy={loading}>
    {error ? <div className={styles.dailyError} role="alert" id={errorId}>
      <span>{error}</span>
      {conflict ? <><button type="button" onClick={() => void reloadCurrent()}>重新载入当前版本</button><button type="button" onClick={exportDraft}>导出本地草稿</button></> : <button type="button" onClick={() => void retry()}>重试保存</button>}
    </div> : null}
    <div className={styles.dailyPaper}>
      <textarea className={styles.dailyText} ref={textareaRef} aria-label="灵感正文" aria-describedby={error ? errorId : undefined}
        readOnly={loading || !sessionRef.current} value={text} style={{ overflow: 'hidden' }}
        onChange={(event) => updateDraft(event.target.value)}
        onCompositionStart={() => { composingRef.current = true; if (timerRef.current !== undefined) window.clearTimeout(timerRef.current) }}
        onCompositionEnd={(event) => { composingRef.current = false; updateDraft(event.currentTarget.value); schedule() }} />
    </div>
  </section>
})
