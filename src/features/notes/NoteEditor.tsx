import { Bold, Code2, Heading2, List, Quote } from "lucide-react"
import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { NoteDocument } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { loadNote, saveNote as saveNoteService } from "./note-service"
import { clearStoredDraft, draftStorageKey, readStoredDraft, writeStoredDraft, type EditorMode, type SaveStatus } from "./editor-state"
import styles from "./NotesWorkspace.module.css"

const MarkdownView = lazy(async () => {
  const module = await import("./MarkdownView")
  return { default: module.MarkdownView }
})

const SPLIT_VIEW_QUERY = "(min-width: 1051px)"

function splitViewAvailable() {
  return typeof window.matchMedia === "function" && window.matchMedia(SPLIT_VIEW_QUERY).matches
}

export interface NoteEditorHandle {
  flush: () => Promise<boolean>
  exportDraft: () => { title: string; markdown: string }
}

interface NoteEditorProps {
  db: VeloDB
  nodeId: string
  saveNote?: typeof saveNoteService
  onSaved?: () => void
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after = before) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end) || "文字"
  return { value: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`, cursor: start + before.length + selected.length + after.length }
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { db, nodeId, saveNote = saveNoteService, onSaved },
  ref,
) {
  const [document, setDocument] = useState<NoteDocument | null>(null)
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [mode, setMode] = useState<EditorMode>("edit")
  const [canSplit, setCanSplit] = useState(splitViewAvailable)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const sessionRef = useRef(0)
  const latestRef = useRef({ title: "", markdown: "", revision: 0, dirty: false })

  const load = useCallback(async () => {
    const session = ++sessionRef.current
    setStatus("loading")
    setError("")
    const loaded = await loadNote(db, nodeId)
    if (session !== sessionRef.current) return
    const revision = loaded.revision ?? 0
    const stored = readStoredDraft(nodeId)
    const useStored = stored && stored.baseRevision === revision
    const nextTitle = useStored ? stored.title : loaded.title
    const nextMarkdown = useStored ? stored.markdown : (loaded.markdown ?? loaded.plainText)
    setDocument(loaded)
    setTitle(nextTitle)
    setMarkdown(nextMarkdown)
    latestRef.current = { title: nextTitle, markdown: nextMarkdown, revision, dirty: Boolean(useStored) }
    setStatus(useStored ? "dirty" : "saved")
  }, [db, nodeId])

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "笔记加载失败")
      setStatus("failed")
    })
    return () => {
      sessionRef.current += 1
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    }
  }, [load])

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined
    const media = window.matchMedia(SPLIT_VIEW_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      setCanSplit(event.matches)
      if (!event.matches) setMode((current) => current === "split" ? "edit" : current)
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const performSave = useCallback(async () => {
    if (composingRef.current) return false
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)

    while (latestRef.current.dirty) {
      if (inFlightRef.current) {
        const earlierSucceeded = await inFlightRef.current
        if (!earlierSucceeded) return false
        continue
      }

      const session = sessionRef.current
      const snapshot = { ...latestRef.current }
      const operation = (async () => {
        setStatus("saving")
        setError("")
        try {
          const saved = await saveNote(db, nodeId, { title: snapshot.title, markdown: snapshot.markdown }, snapshot.revision, Date.now())
          if (session !== sessionRef.current) return false
          setDocument(saved)
          const stillCurrent = latestRef.current.title === snapshot.title && latestRef.current.markdown === snapshot.markdown
          latestRef.current.revision = saved.revision ?? snapshot.revision + 1
          latestRef.current.dirty = !stillCurrent
          if (stillCurrent) {
            clearStoredDraft(nodeId)
            setStatus("saved")
          } else {
            writeStoredDraft(nodeId, {
              title: latestRef.current.title,
              markdown: latestRef.current.markdown,
              baseRevision: latestRef.current.revision,
              updatedAt: Date.now(),
            })
            setStatus("dirty")
          }
          onSaved?.()
          return true
        } catch (reason) {
          if (session !== sessionRef.current) return false
          const message = reason instanceof Error ? reason.message : "保存失败"
          const conflict = message.includes("先重新加载")
          setError(message)
          setStatus(conflict ? "conflict" : "failed")
          return false
        }
      })()

      inFlightRef.current = operation
      const succeeded = await operation
      if (inFlightRef.current === operation) inFlightRef.current = null
      if (!succeeded) return false
    }
    return true
  }, [db, nodeId, onSaved, saveNote])

  const scheduleSave = useCallback(() => {
    if (composingRef.current) return
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void performSave(), 320)
  }, [performSave])

  function updateDraft(nextTitle: string, nextMarkdown: string) {
    setTitle(nextTitle)
    setMarkdown(nextMarkdown)
    latestRef.current = { ...latestRef.current, title: nextTitle, markdown: nextMarkdown, dirty: true }
    writeStoredDraft(nodeId, { title: nextTitle, markdown: nextMarkdown, baseRevision: latestRef.current.revision, updatedAt: Date.now() })
    setStatus("dirty")
    setError("")
    scheduleSave()
  }

  useImperativeHandle(ref, () => ({
    flush: performSave,
    exportDraft: () => ({ title: latestRef.current.title, markdown: latestRef.current.markdown }),
  }), [performSave])

  function insert(before: string, after?: string) {
    if (composingRef.current || !textareaRef.current) return
    const result = wrapSelection(textareaRef.current, before, after)
    updateDraft(title, result.value)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  if (!document && status === "loading") return <div className={styles.editorMessage} aria-busy="true">正在打开笔记…</div>

  const statusText = status === "saving" ? "保存中…" : status === "saved" ? "已保存" : status === "dirty" ? "等待保存" : status === "conflict" ? "发现其他页面保存的新版本" : "保存失败，草稿仍在本机"
  return (
    <section className={styles.editor} aria-label="笔记编辑器">
      <div className={styles.editorTopline}>
        <label className={styles.titleField}>
          <span>笔记标题</span>
          <input value={title} onChange={(event) => updateDraft(event.target.value, markdown)} />
        </label>
        <span className={`${styles.saveStatus} ${styles[status]}`} aria-live="polite">{statusText}</span>
      </div>

      <div className={styles.editorControls}>
        <div className={styles.modeSwitcher} aria-label="显示模式">
          {(["edit", "read", ...(canSplit ? ["split" as const] : [])] as EditorMode[]).map((value) => (
            <button aria-pressed={mode === value} key={value} onClick={() => setMode(value)} type="button">
              {{ edit: "编辑", read: "阅读", split: "分栏" }[value]}
            </button>
          ))}
        </div>
        {(mode === "edit" || mode === "split") ? (
          <div className={styles.formatBar} aria-label="Markdown 格式工具">
            <button aria-label="二级标题" onClick={() => insert("## ", "")} type="button"><Heading2 aria-hidden="true" /></button>
            <button aria-label="加粗" onClick={() => insert("**")} type="button"><Bold aria-hidden="true" /></button>
            <button aria-label="列表" onClick={() => insert("- ", "")} type="button"><List aria-hidden="true" /></button>
            <button aria-label="引用" onClick={() => insert("> ", "")} type="button"><Quote aria-hidden="true" /></button>
            <button aria-label="行内代码" onClick={() => insert("`")} type="button"><Code2 aria-hidden="true" /></button>
          </div>
        ) : null}
      </div>

      {status === "failed" ? (
        <div className={styles.saveError} role="alert">
          <span>{error || "保存失败，请重试"}</span>
          <button onClick={() => void performSave()} type="button">重试保存</button>
        </div>
      ) : null}
      {status === "conflict" ? (
        <div className={styles.conflict} role="alert">
          <p>{error}</p>
          <div>
            <button onClick={() => void load()} type="button">重新载入当前版本</button>
            <button onClick={() => downloadText(`${title || "本地草稿"}-本地草稿.md`, markdown)} type="button">导出本地草稿</button>
          </div>
        </div>
      ) : null}

      <div className={`${styles.editorBody} ${mode === "split" ? styles.split : ""}`}>
        {mode !== "read" ? (
          <label className={styles.markdownField}>
            <span>Markdown 正文</span>
            <textarea
              onChange={(event) => updateDraft(title, event.target.value)}
              onCompositionEnd={() => { composingRef.current = false; scheduleSave() }}
              onCompositionStart={() => { composingRef.current = true; if (timerRef.current !== undefined) window.clearTimeout(timerRef.current) }}
              ref={textareaRef}
              spellCheck="true"
              value={markdown}
            />
          </label>
        ) : null}
        {mode !== "edit" ? <Suspense fallback={<div className={styles.editorMessage}>正在生成阅读视图…</div>}><MarkdownView markdown={markdown} /></Suspense> : null}
      </div>
      <span className={styles.storageHint}>草稿保存在此设备 · {draftStorageKey(nodeId).includes(nodeId) ? "本地优先" : ""}</span>
    </section>
  )
})
