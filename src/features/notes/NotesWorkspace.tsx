import { useLiveQuery } from "dexie-react-hooks"
import { Download, FolderOpen, Inbox, Menu, MoreHorizontal, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { KnowledgeNode } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import { NoteActionsDialog } from "./NoteActionsDialog"
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor"
import { NoteTree } from "./NoteTree"
import { loadExpandedFolderIds, saveExpandedFolderIds } from "./tree-expansion"
import {
  createNote,
  exportMarkdown,
  moveNote,
  restoreNote,
  saveNote,
  trashNote,
} from "./note-service"
import styles from "./NotesWorkspace.module.css"

export interface NoteServiceOverrides {
  createNote?: typeof createNote
  exportMarkdown?: typeof exportMarkdown
  moveNote?: typeof moveNote
  restoreNote?: typeof restoreNote
  saveNote?: typeof saveNote
  trashNote?: typeof trashNote
}

interface NotesWorkspaceProps {
  db: VeloDB
  services?: NoteServiceOverrides
}

type Area = "all" | "inbox" | "trash"

function downloadMarkdown(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildBreadcrumbs(nodes: KnowledgeNode[], selected: KnowledgeNode) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const result: KnowledgeNode[] = []
  const visited = new Set<string>()
  let cursor: KnowledgeNode | undefined = selected
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id)
    result.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return result
}

function ancestorFolderIds(nodes: KnowledgeNode[], nodeId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestors = new Set<string>()
  const visited = new Set<string>()
  let cursor = byId.get(nodeId)
  while (cursor?.parentId && !visited.has(cursor.parentId)) {
    visited.add(cursor.parentId)
    const parent = byId.get(cursor.parentId)
    if (!parent) break
    if (parent.type === "folder") ancestors.add(parent.id)
    cursor = parent
  }
  return ancestors
}

export function NotesWorkspace({ db, services }: NotesWorkspaceProps) {
  const api = useMemo(() => ({ createNote, exportMarkdown, moveNote, restoreNote, saveNote, trashNote, ...services }), [services])
  const queriedNodes = useLiveQuery(() => db.knowledgeNodes.toArray(), [db])
  const nodes = useMemo(() => queriedNodes ?? [], [queriedNodes])
  const [params, setParams] = useSearchParams()
  const selectedId = params.get("note")
  const area = (params.get("area") as Area | null) ?? "all"
  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const editorRef = useRef<NoteEditorHandle>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(272)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hasLoadedExpansion, setHasLoadedExpansion] = useState(false)
  const expandedIdsRef = useRef(expandedIds)
  const expansionDbRef = useRef<VeloDB | null>(null)
  const drawerTitleId = useId()
  const trashTitleId = useId()

  useEffect(() => {
    if (queriedNodes === undefined || expansionDbRef.current === db) return
    let active = true
    void loadExpandedFolderIds(db).then((storedIds) => {
      if (!active) return
      expansionDbRef.current = db
      expandedIdsRef.current = new Set(storedIds)
      setExpandedIds(new Set(storedIds))
      setHasLoadedExpansion(true)
    }).catch(() => {
      if (!active) return
      expansionDbRef.current = db
      const emptyIds = new Set<string>()
      expandedIdsRef.current = emptyIds
      setExpandedIds(emptyIds)
      setHasLoadedExpansion(true)
      setMessage("目录展开状态读取失败，本次将使用折叠状态。")
    })
    return () => { active = false }
  }, [db, queriedNodes])

  useEffect(() => {
    if (!hasLoadedExpansion || !selectedId) return
    const nextIds = new Set(expandedIdsRef.current)
    for (const id of ancestorFolderIds(nodes, selectedId)) nextIds.add(id)
    if (nextIds.size === expandedIdsRef.current.size) return

    expandedIdsRef.current = nextIds
    setExpandedIds(nextIds)
    void saveExpandedFolderIds(db, nextIds, Date.now()).catch(() => {
      setMessage("目录展开状态保存失败，本次操作仍会保留到页面关闭前。")
    })
  }, [db, hasLoadedExpansion, nodes, selectedId])

  const visibleNodes = useMemo(() => {
    if (area === "trash") return nodes.filter((node) => node.deletedAt !== undefined)
    if (area === "inbox") {
      const inboxRoots = new Set(nodes.filter((node) => node.deletedAt === undefined && node.inbox).map((node) => node.id))
      let changed = true
      while (changed) {
        changed = false
        for (const node of nodes) {
          if (node.deletedAt === undefined && node.parentId && inboxRoots.has(node.parentId) && !inboxRoots.has(node.id)) {
            inboxRoots.add(node.id)
            changed = true
          }
        }
      }
      return nodes.filter((node) => inboxRoots.has(node.id))
    }
    return nodes.filter((node) => node.deletedAt === undefined)
  }, [area, nodes])

  const flush = useCallback(async () => editorRef.current?.flush() ?? true, [])

  async function toggleFolder(nodeId: string) {
    const nextIds = new Set(expandedIdsRef.current)
    if (nextIds.has(nodeId)) nextIds.delete(nodeId)
    else nextIds.add(nodeId)
    expandedIdsRef.current = nextIds
    setExpandedIds(nextIds)
    try {
      await saveExpandedFolderIds(db, nextIds, Date.now())
    } catch {
      setMessage("目录展开状态保存失败，本次操作仍会保留到页面关闭前。")
    }
  }

  async function selectNode(nodeId: string) {
    if (nodeId === selectedId) { setDrawerOpen(false); return }
    if (!(await flush())) {
      setMessage("请先处理当前笔记的保存问题，再切换笔记。")
      return
    }
    const nextExpandedIds = new Set(expandedIdsRef.current)
    for (const id of ancestorFolderIds(nodes, nodeId)) nextExpandedIds.add(id)
    if (nextExpandedIds.size !== expandedIdsRef.current.size) {
      expandedIdsRef.current = nextExpandedIds
      setExpandedIds(nextExpandedIds)
      try {
        await saveExpandedFolderIds(db, nextExpandedIds, Date.now())
      } catch {
        setMessage("目录展开状态保存失败，本次操作仍会保留到页面关闭前。")
      }
    }
    const next = new URLSearchParams(params)
    next.set("note", nodeId)
    setParams(next)
    setDrawerOpen(false)
  }

  async function selectArea(nextArea: Area) {
    if (!(await flush())) {
      setMessage("请先处理当前笔记的保存问题，再切换目录。")
      return
    }
    const next = new URLSearchParams()
    if (nextArea !== "all") next.set("area", nextArea)
    setParams(next)
    setDrawerOpen(false)
  }

  async function createNew(parentId: string | null = null) {
    if (!(await flush())) return
    const created = await api.createNote(db, { title: "未命名笔记", parentId, inbox: parentId === null && area === "inbox" }, Date.now())
    const next = new URLSearchParams()
    if (area !== "all") next.set("area", area)
    next.set("note", created.id)
    setParams(next)
    setActionsOpen(false)
    setDrawerOpen(false)
  }

  async function doMove(parentId: string | null, inbox: boolean) {
    if (!selected || !(await flush())) return
    await api.moveNote(db, selected.id, parentId, inbox, new Date().getTime())
    setActionsOpen(false)
    if (inbox) {
      const next = new URLSearchParams({ area: "inbox", note: selected.id })
      setParams(next)
    }
  }

  async function doTrash() {
    if (!selected || !(await flush())) return
    await api.trashNote(db, selected.id, new Date().getTime())
    setTrashConfirmOpen(false)
    setActionsOpen(false)
    setParams(new URLSearchParams({ area: "trash", note: selected.id }))
  }

  async function doRestore() {
    if (!selected) return
    await api.restoreNote(db, selected.id, new Date().getTime())
    setParams(new URLSearchParams({ note: selected.id }))
  }

  async function doExport() {
    if (!selected || !(await flush())) {
      setMessage("保存成功后才能导出 Markdown。")
      return
    }
    const exported = await api.exportMarkdown(db, selected.id)
    downloadMarkdown(exported.filename, exported.text)
  }

  const breadcrumbs = selected ? buildBreadcrumbs(nodes, selected) : []
  const directory = (
    <div className={styles.directoryBody}>
      <nav className={styles.areaNav} aria-label="笔记区域">
        <button aria-current={area === "all" ? "page" : undefined} onClick={() => void selectArea("all")} type="button"><FolderOpen aria-hidden="true" />全部笔记</button>
        <button aria-current={area === "inbox" ? "page" : undefined} onClick={() => void selectArea("inbox")} type="button"><Inbox aria-hidden="true" />笔记收件箱</button>
        <button aria-current={area === "trash" ? "page" : undefined} onClick={() => void selectArea("trash")} type="button"><Trash2 aria-hidden="true" />回收站</button>
      </nav>
      <div className={styles.treeHeader}><span>{area === "trash" ? "已删除" : area === "inbox" ? "待整理" : "知识目录"}</span><span>{visibleNodes.length}</span></div>
      <NoteTree
        expandedIds={expandedIds}
        nodes={visibleNodes}
        onSelect={(node) => selectNode(node.id)}
        onToggle={toggleFolder}
        selectedId={selectedId}
      />
    </div>
  )

  return (
    <main className={styles.page}>
      <header className={styles.workspaceHeader}>
        <div><p>知识笔记</p><h1 data-nowrap="true">笔记工作台</h1></div>
        <div className={styles.headerActions}>
          <button className={styles.directoryButton} onClick={() => setDrawerOpen(true)} type="button"><Menu aria-hidden="true" /><span data-nowrap="true">目录</span></button>
          <button className={styles.primaryButton} onClick={() => void createNew()} type="button"><Plus aria-hidden="true" /><span data-nowrap="true">新建笔记</span></button>
        </div>
      </header>

      {message ? <div className={styles.workspaceMessage} role="alert"><span>{message}</span><button onClick={() => setMessage("")} type="button">关闭</button></div> : null}
      <div className={styles.workspace} style={{ "--notes-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
        {sidebarVisible ? (
          <aside className={styles.directory} aria-label="笔记目录">
            <div className={styles.directoryTop}><strong>目录</strong><button aria-label="收起目录" onClick={() => setSidebarVisible(false)} type="button"><PanelLeftClose aria-hidden="true" /></button></div>
            {directory}
            <label className={styles.widthControl}>
              <span>目录宽度</span>
              <input aria-label="目录宽度" max="360" min="220" onChange={(event) => setSidebarWidth(Number(event.target.value))} type="range" value={sidebarWidth} />
            </label>
          </aside>
        ) : (
          <button aria-label="展开目录" className={styles.reopenDirectory} onClick={() => setSidebarVisible(true)} type="button"><PanelLeftOpen aria-hidden="true" /></button>
        )}

        <section className={styles.contentPane} aria-label="笔记内容">
          {selected?.type === "folder" ? (
            <div className={styles.emptyState}>
              <span><FolderOpen aria-hidden="true" /></span>
              <h2>{selected.title}</h2>
              <p>文件夹的正文功能将在后续版本提供。</p>
            </div>
          ) : selected ? (
            <>
              <div className={styles.noteToolbar}>
                <nav aria-label="当前笔记路径" className={styles.breadcrumbs}>
                  {breadcrumbs.map((node, index) => <span key={node.id}>{index ? <i aria-hidden="true">/</i> : null}<button onClick={() => void selectNode(node.id)} type="button">{node.title}</button></span>)}
                </nav>
                <div className={styles.noteActions}>
              {selected.deletedAt !== undefined ? <button onClick={() => void doRestore()} type="button">恢复笔记</button> : <button onClick={() => void doExport()} type="button"><Download aria-hidden="true" />导出 Markdown</button>}
                  {selected.deletedAt === undefined ? <button aria-label="笔记操作" onClick={() => setActionsOpen(true)} type="button"><MoreHorizontal aria-hidden="true" /></button> : null}
                </div>
              </div>
              {selected.deletedAt === undefined ? <NoteEditor db={db} key={selected.id} nodeId={selected.id} onSaved={() => undefined} ref={editorRef} saveNote={api.saveNote} /> : <div className={styles.deletedState}><Trash2 aria-hidden="true" /><h2>{selected.title}</h2><p>这篇笔记在回收站中，使用上方“恢复笔记”即可继续编辑。</p></div>}
            </>
          ) : (
            <div className={styles.emptyState}>
              <span><NotebookPen aria-hidden="true" /></span>
              <p>{area === "trash" ? "回收站是空的" : area === "inbox" ? "收件箱里还没有笔记" : "从第一篇笔记开始建立你的知识目录"}</p>
              {area !== "trash" ? <button aria-label="创建第一篇笔记" onClick={() => void createNew()} type="button"><Plus aria-hidden="true" />开始记录</button> : null}
            </div>
          )}
        </section>
      </div>

      <PlanDialog labelledBy={drawerTitleId} onRequestClose={() => setDrawerOpen(false)} open={drawerOpen}>
        <section className={styles.drawer}>
          <header><h2 id={drawerTitleId}>笔记目录</h2><button aria-label="关闭目录" onClick={() => setDrawerOpen(false)} type="button">×</button></header>
          {directory}
        </section>
      </PlanDialog>

      {selected?.type === "note" && selected.deletedAt === undefined ? (
        <NoteActionsDialog
          node={selected}
          nodes={nodes}
          onAddChild={() => createNew(selected.id)}
          onAddSibling={() => createNew(selected.parentId)}
          onMove={doMove}
          onRequestClose={() => setActionsOpen(false)}
          onRequestTrash={() => { setActionsOpen(false); setTrashConfirmOpen(true) }}
          open={actionsOpen}
        />
      ) : null}

      <PlanDialog labelledBy={trashTitleId} onRequestClose={() => setTrashConfirmOpen(false)} open={trashConfirmOpen}>
        <section className={styles.confirmDialog}>
          <h2 id={trashTitleId}>移到回收站？</h2>
          <p>子笔记也会一起进入回收站，可随时恢复。</p>
          <div><button onClick={() => setTrashConfirmOpen(false)} type="button">取消</button><button className={styles.trashButton} onClick={() => void doTrash()} type="button">确认移到回收站</button></div>
        </section>
      </PlanDialog>
    </main>
  )
}
