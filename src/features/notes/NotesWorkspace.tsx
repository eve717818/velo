import { useLiveQuery } from "dexie-react-hooks"
import { Download, FolderOpen, Menu, MoreHorizontal, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import type { KnowledgeNode } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import { NoteActionsDialog } from "./NoteActionsDialog"
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor"
import { NoteTree, type TreeEditState } from "./NoteTree"
import { NewKnowledgeNodeMenu, type NewKnowledgeNodeSelection } from "./NewKnowledgeNodeMenu"
import { loadExpandedFolderIds, saveExpandedFolderIds } from "./tree-expansion"
import { createFolder, createNote, exportMarkdown, moveNode, renameNode, restoreNode, saveNote, trashNode } from "./note-service"
import styles from "./NotesWorkspace.module.css"

export interface NoteServiceOverrides {
  createFolder?: typeof createFolder
  createNote?: typeof createNote
  exportMarkdown?: typeof exportMarkdown
  moveNode?: typeof moveNode
  renameNode?: typeof renameNode
  restoreNode?: typeof restoreNode
  saveNote?: typeof saveNote
  trashNode?: typeof trashNode
}

interface NotesWorkspaceProps { db: VeloDB; services?: NoteServiceOverrides }
type Area = "all" | "trash"
type NotesLocationState = { selectedFolderId?: string | null }

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
  const api = useMemo(() => ({ createFolder, createNote, exportMarkdown, moveNode, renameNode, restoreNode, saveNote, trashNode, ...services }), [services])
  const queriedNodes = useLiveQuery(() => db.knowledgeNodes.toArray(), [db])
  const nodes = useMemo(() => queriedNodes ?? [], [queriedNodes])
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const urlNoteId = params.get("note")
  const area = params.get("area") === "trash" ? "trash" : "all"
  const selectedFolderId = typeof (location.state as NotesLocationState | null)?.selectedFolderId === "string" ? (location.state as NotesLocationState).selectedFolderId! : null
  const urlSelected = nodes.find((node) => node.id === urlNoteId && node.type === "note") ?? null
  const requestedSelected = urlSelected ?? nodes.find((node) => node.id === selectedFolderId) ?? null
  const selected = requestedSelected && (area === "trash" ? requestedSelected.deletedAt !== undefined : requestedSelected.deletedAt === undefined) ? requestedSelected : null
  const selectedNodeId = selected?.id ?? null
  const editorRef = useRef<NoteEditorHandle>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(272)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false)
  const [nodeEditor, setNodeEditor] = useState<TreeEditState | null>(null)
  const [focusTreeNodeId, setFocusTreeNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hasLoadedExpansion, setHasLoadedExpansion] = useState(false)
  const expandedIdsRef = useRef(expandedIds)
  const expansionDbRef = useRef<VeloDB | null>(null)
  const [actionReturnFocus, setActionReturnFocus] = useState<HTMLElement | null>(null)
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
      setHasLoadedExpansion(true)
      setMessage("目录展开状态读取失败，本次将使用折叠状态。")
    })
    return () => { active = false }
  }, [db, queriedNodes])

  const persistExpansion = useCallback(async (nextIds: Set<string>) => {
    expandedIdsRef.current = nextIds
    setExpandedIds(nextIds)
    try { await saveExpandedFolderIds(db, nextIds, Date.now()) }
    catch { setMessage("目录展开状态保存失败，本次操作仍会保留到页面关闭前。") }
  }, [db])

  useEffect(() => {
    if (!hasLoadedExpansion || !selectedNodeId) return
    const nextIds = new Set(expandedIdsRef.current)
    for (const id of ancestorFolderIds(nodes, selectedNodeId)) nextIds.add(id)
    if (nextIds.size !== expandedIdsRef.current.size) void persistExpansion(nextIds)
  }, [hasLoadedExpansion, nodes, persistExpansion, selectedNodeId])

  const visibleNodes = useMemo(() => nodes.filter((node) => area === "trash" ? node.deletedAt !== undefined : node.deletedAt === undefined), [area, nodes])
  const flush = useCallback(async () => selected?.type === "note" && selected.deletedAt === undefined ? editorRef.current?.flush() ?? true : true, [selected])

  async function toggleFolder(nodeId: string) {
    const nextIds = new Set(expandedIdsRef.current)
    if (nextIds.has(nodeId)) nextIds.delete(nodeId)
    else nextIds.add(nodeId)
    await persistExpansion(nextIds)
  }

  async function selectNode(node: KnowledgeNode) {
    if (node.id !== selectedNodeId && !(await flush())) {
      setMessage("请先处理当前笔记的保存问题，再切换笔记。")
      return
    }
    const nextIds = new Set(expandedIdsRef.current)
    for (const id of ancestorFolderIds(nodes, node.id)) nextIds.add(id)
    if (nextIds.size !== expandedIdsRef.current.size) await persistExpansion(nextIds)
    const next = new URLSearchParams(params)
    if (node.type === "note") next.set("note", node.id)
    else next.delete("note")
    setParams(next, { state: node.type === "folder" ? { selectedFolderId: node.id } satisfies NotesLocationState : null })
    setDrawerOpen(false)
  }

  async function selectArea(nextArea: Area) {
    if (!(await flush())) { setMessage("请先处理当前笔记的保存问题，再切换目录。"); return }
    const next = new URLSearchParams()
    if (nextArea === "trash") next.set("area", "trash")
    setParams(next, { state: null })
    setDrawerOpen(false)
  }

  async function startCreation(selection: NewKnowledgeNodeSelection, returnFocusTo: HTMLElement | null = null) {
    if (!(await flush())) {
      setMessage("请先处理当前笔记的保存问题，再新建节点。")
      return false
    }
    if (selection.parentId) {
      const nextIds = new Set(expandedIdsRef.current).add(selection.parentId)
      await persistExpansion(nextIds)
    }
    setNodeEditor({ mode: "create", ...selection, returnFocusTo })
    return true
  }

  async function startRename(returnFocusTo: HTMLElement | null = null) {
    if (!selected) return false
    if (!(await flush())) {
      setMessage("请先处理当前笔记的保存问题，再重命名。")
      return false
    }
    setNodeEditor({ mode: "rename", node: selected, returnFocusTo })
    return true
  }

  function cancelNodeEditor() {
    const editing = nodeEditor
    setNodeEditor(null)
    const fallbackId = editing?.mode === "rename" ? editing.node.id : editing?.parentId ?? null
    setFocusTreeNodeId(fallbackId)
    if (!fallbackId && editing?.returnFocusTo?.isConnected) queueMicrotask(() => editing.returnFocusTo?.focus())
  }

  async function commitNodeTitle(title: string) {
    if (!nodeEditor) return
    if (nodeEditor.mode === "rename") {
      const renamed = await api.renameNode(db, nodeEditor.node.id, title, Date.now())
      setFocusTreeNodeId(renamed.id)
    } else {
      const created = nodeEditor.type === "folder"
        ? await api.createFolder(db, { title, parentId: nodeEditor.parentId }, Date.now())
        : await api.createNote(db, { title, parentId: nodeEditor.parentId }, Date.now())
      if (created.parentId) {
        const nextIds = new Set(expandedIdsRef.current).add(created.parentId)
        await persistExpansion(nextIds)
      }
      const next = new URLSearchParams(params)
      if (created.type === "note") next.set("note", created.id)
      else next.delete("note")
      setParams(next, { state: created.type === "folder" ? { selectedFolderId: created.id } satisfies NotesLocationState : null })
      setFocusTreeNodeId(created.id)
    }
    setNodeEditor(null)
    setDrawerOpen(false)
  }

  async function doMove(parentId: string | null) {
    if (!selected) return
    if (!(await flush())) { setMessage("请先处理当前笔记的保存问题，再移动节点。") ; throw new Error("当前笔记尚未保存") }
    await api.moveNode(db, selected.id, parentId, Date.now())
    setActionsOpen(false)
  }

  async function doTrash() {
    if (!selected || !(await flush())) return
    await api.trashNode(db, selected.id, Date.now())
    setTrashConfirmOpen(false)
    setActionsOpen(false)
    const next = new URLSearchParams({ area: "trash" })
    if (selected.type === "note") next.set("note", selected.id)
    setParams(next, { state: selected.type === "folder" ? { selectedFolderId: selected.id } satisfies NotesLocationState : null })
  }

  async function doRestore() {
    if (!selected) return
    try {
      await api.restoreNode(db, selected.id, Date.now())
      const next = new URLSearchParams()
      if (selected.type === "note") next.set("note", selected.id)
      setParams(next, { state: selected.type === "folder" ? { selectedFolderId: selected.id } satisfies NotesLocationState : null })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败，请重试")
    }
  }

  async function doExport() {
    if (!selected || selected.type !== "note" || !(await flush())) { setMessage("保存成功后才能导出 Markdown。"); return }
    const exported = await api.exportMarkdown(db, selected.id)
    downloadMarkdown(exported.filename, exported.text)
  }

  const breadcrumbs = selected ? buildBreadcrumbs(nodes, selected) : []
  const folderChildCount = selected?.type === "folder" ? nodes.filter((node) => node.parentId === selected.id && node.deletedAt === undefined).length : 0
  const directory = (
    <div className={styles.directoryBody}>
      <nav className={styles.areaNav} aria-label="笔记区域">
        <button aria-current={area === "all" ? "page" : undefined} onClick={() => void selectArea("all")} type="button"><FolderOpen aria-hidden="true" />全部笔记</button>
        <button aria-current={area === "trash" ? "page" : undefined} onClick={() => void selectArea("trash")} type="button"><Trash2 aria-hidden="true" />回收站</button>
      </nav>
      <div className={styles.treeHeader}><span>{area === "trash" ? "已删除" : "知识目录"}</span><span>{visibleNodes.length}</span></div>
      <NoteTree editing={nodeEditor} expandedIds={expandedIds} focusNodeId={focusTreeNodeId} nodes={visibleNodes} onCancelEdit={cancelNodeEditor} onCommitEdit={commitNodeTitle} onSelect={selectNode} onToggle={toggleFolder} selectedId={selectedNodeId} />
    </div>
  )

  return (
    <main className={styles.page}>
      <header className={styles.workspaceHeader}>
        <div><p>知识笔记</p><h1 data-nowrap="true">笔记工作台</h1></div>
        <div className={styles.headerActions}>
          <button className={styles.directoryButton} onClick={() => setDrawerOpen(true)} type="button"><Menu aria-hidden="true" /><span data-nowrap="true">目录</span></button>
          <NewKnowledgeNodeMenu onSelect={startCreation} parentId={selected?.type === "folder" && selected.deletedAt === undefined ? selected.id : null} />
        </div>
      </header>
      {message ? <div className={styles.workspaceMessage} role="alert"><span>{message}</span><button onClick={() => setMessage("")} type="button">关闭</button></div> : null}
      <div className={styles.workspace} style={{ "--notes-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
        {sidebarVisible ? <aside className={styles.directory} aria-label="笔记目录"><div className={styles.directoryTop}><strong>目录</strong><button aria-label="收起目录" onClick={() => setSidebarVisible(false)} type="button"><PanelLeftClose aria-hidden="true" /></button></div>{directory}<label className={styles.widthControl}><span>目录宽度</span><input aria-label="目录宽度" max="360" min="220" onChange={(event) => setSidebarWidth(Number(event.target.value))} type="range" value={sidebarWidth} /></label></aside> : <button aria-label="展开目录" className={styles.reopenDirectory} onClick={() => setSidebarVisible(true)} type="button"><PanelLeftOpen aria-hidden="true" /></button>}
        <section className={styles.contentPane} aria-label="笔记内容">
          {selected?.deletedAt !== undefined ? <div className={styles.deletedState}><Trash2 aria-hidden="true" /><h2>{selected.title}</h2><p>{selected.type === "folder" ? "该文件夹在回收站中，恢复后将带回所有子文件夹和笔记。" : "这篇笔记在回收站中，恢复后即可继续编辑。"}</p><button onClick={() => void doRestore()} type="button">恢复{selected.type === "folder" ? "文件夹" : "笔记"}</button></div> : selected?.type === "folder" ? <div className={styles.emptyState}><span><FolderOpen aria-hidden="true" /></span><h2>{selected.title}</h2><p>{breadcrumbs.map((node) => node.title).join(" / ")} · {folderChildCount} 个子节点</p><div className={styles.folderActions}><button onClick={(event) => void startCreation({ type: "folder", parentId: selected.id }, event.currentTarget)} type="button">新建子文件夹</button><button onClick={(event) => void startCreation({ type: "note", parentId: selected.id }, event.currentTarget)} type="button">新建笔记</button><button aria-label={`节点操作：${selected.title}`} onClick={(event) => { setActionReturnFocus(event.currentTarget); setActionsOpen(true) }} type="button"><MoreHorizontal aria-hidden="true" />操作</button></div></div> : selected ? <><div className={styles.noteToolbar}><nav aria-label="当前笔记路径" className={styles.breadcrumbs}>{breadcrumbs.map((node, index) => <span key={node.id}>{index ? <i aria-hidden="true">/</i> : null}<button onClick={() => void selectNode(node)} type="button">{node.title}</button></span>)}</nav><div className={styles.noteActions}><button onClick={() => void doExport()} type="button"><Download aria-hidden="true" />导出 Markdown</button><button aria-label={`节点操作：${selected.title}`} onClick={(event) => { setActionReturnFocus(event.currentTarget); setActionsOpen(true) }} type="button"><MoreHorizontal aria-hidden="true" /></button></div></div><NoteEditor db={db} key={selected.id} nodeId={selected.id} onSaved={() => undefined} ref={editorRef} saveNote={api.saveNote} /></> : <div className={styles.emptyState}><span><NotebookPen aria-hidden="true" /></span><p>{area === "trash" ? "回收站是空的" : "从第一个文件夹或笔记开始建立你的知识目录"}</p>{area !== "trash" ? <button onClick={(event) => void startCreation({ type: "note", parentId: null }, event.currentTarget)} type="button"><Plus aria-hidden="true" />开始记录</button> : null}</div>}
        </section>
      </div>
      <PlanDialog labelledBy={drawerTitleId} onRequestClose={() => setDrawerOpen(false)} open={drawerOpen}><section className={styles.drawer}><header><h2 id={drawerTitleId}>笔记目录</h2><button aria-label="关闭目录" onClick={() => setDrawerOpen(false)} type="button">×</button></header>{directory}</section></PlanDialog>
      {selected && selected.deletedAt === undefined ? <NoteActionsDialog node={selected} nodes={nodes} onAdd={(type, parentId) => startCreation({ type, parentId })} onMove={doMove} onRename={() => startRename()} onRequestClose={() => setActionsOpen(false)} onRequestTrash={() => { setActionsOpen(false); setTrashConfirmOpen(true) }} open={actionsOpen} returnFocusTo={actionReturnFocus} /> : null}
      <PlanDialog labelledBy={trashTitleId} onRequestClose={() => setTrashConfirmOpen(false)} open={trashConfirmOpen}><section className={styles.confirmDialog}><h2 id={trashTitleId}>移到回收站？</h2><p>{selected?.type === "folder" ? "文件夹内的子文件夹和笔记会一起进入回收站，可随时恢复。" : "这篇笔记会进入回收站，可随时恢复。"}</p><div><button onClick={() => setTrashConfirmOpen(false)} type="button">取消</button><button className={styles.trashButton} onClick={() => void doTrash()} type="button">确认移到回收站</button></div></section></PlanDialog>
    </main>
  )
}
