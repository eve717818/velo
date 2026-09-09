import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react"
import { useEffect, useId, useRef, type MutableRefObject } from "react"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"
import { TreeNodeEditor } from "./TreeNodeEditor"
import { NewKnowledgeNodeMenu, type NewKnowledgeNodeSelection } from "./NewKnowledgeNodeMenu"

export type TreeEditState =
  | { mode: "create"; type: "folder" | "note"; parentId: string | null; parentPath: string; returnFocusTo?: HTMLElement | null }
  | { mode: "rename"; node: KnowledgeNode; parentPath: string; returnFocusTo?: HTMLElement | null }

interface NoteTreeProps {
  nodes: KnowledgeNode[]
  selectedId: string | null
  expandedIds: Set<string>
  editing: TreeEditState | null
  focusNodeId: string | null
  onCancelEdit: () => void
  onCommitEdit: (title: string) => void | Promise<void>
  onCreate?: (selection: NewKnowledgeNodeSelection, returnFocusTo: HTMLButtonElement | null) => void | Promise<boolean>
  onSelect: (node: KnowledgeNode) => void | Promise<void>
  onSelectRoot?: () => void | Promise<void>
  onToggle: (nodeId: string) => void | Promise<void>
}
interface BranchProps extends NoteTreeProps {
  node: KnowledgeNode
  childrenByParent: Map<string | null, KnowledgeNode[]>
  nodeRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  visited: Set<string>
}

function editorLabel(editing: TreeEditState) {
  const type = editing.mode === "rename" ? editing.node.type : editing.type
  return `${type === "folder" ? "文件夹" : "笔记"}名称`
}

function TemporaryRow({ editing, onCancelEdit, onCommitEdit }: Pick<NoteTreeProps, "editing" | "onCancelEdit" | "onCommitEdit">) {
  if (!editing || editing.mode !== "create") return null
  const label = editorLabel(editing)
  return <li className={styles.temporaryTreeRow}><div className={styles.treeRow}><span className={styles.treeTogglePlaceholder} /><div aria-label={`${label}，位置：${editing.parentPath}`} className={styles.treeEditGroup} role="group"><span>位置：{editing.parentPath}</span><TreeNodeEditor ariaLabel={label} initialValue="" onCancel={onCancelEdit} onCommit={onCommitEdit} /></div></div></li>
}

function Branch({ node, childrenByParent, visited, selectedId, expandedIds, editing, focusNodeId: _focusNodeId, onCancelEdit, onCommitEdit, onCreate, onSelect, onToggle, nodeRefs }: BranchProps) {
  const childrenId = useId()
  if (visited.has(node.id)) return null
  const nextVisited = new Set(visited).add(node.id)
  const children = childrenByParent.get(node.id) ?? []
  const temporaryChild = editing?.mode === "create" && editing.parentId === node.id
  const expandable = node.type === "folder" && (children.length > 0 || temporaryChild)
  const expanded = expandable && (temporaryChild || expandedIds.has(node.id))
  const NodeIcon = node.type === "folder" ? (expanded ? FolderOpen : Folder) : FileText
  const renaming = editing?.mode === "rename" && editing.node.id === node.id
  const showCreate = node.type === "folder" && selectedId === node.id && onCreate !== undefined
  return <li>
    <div className={styles.treeRow}>
      {expandable ? <button aria-controls={childrenId} aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${node.title}`} className={styles.treeToggle} onClick={() => void onToggle(node.id)} type="button">{expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}</button> : <span className={styles.treeTogglePlaceholder} />}
      {renaming ? <div aria-label={`${editorLabel(editing)}，位置：${editing.parentPath}`} className={styles.treeEditGroup} role="group"><span>位置：{editing.parentPath}</span><TreeNodeEditor ariaLabel={editorLabel(editing)} initialValue={node.title} onCancel={onCancelEdit} onCommit={onCommitEdit} /></div> : <div className={styles.treeNodeGroup}><button aria-current={selectedId === node.id ? "page" : undefined} aria-label={node.type === "folder" ? node.title : `打开笔记：${node.title}`} className={styles.treeNode} onClick={() => void onSelect(node)} ref={(element) => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id) }} type="button"><NodeIcon aria-hidden="true" size={16} /><span className={styles.treeLabel}>{node.title}</span></button>{showCreate ? <NewKnowledgeNodeMenu containerTitle={node.title} onSelect={onCreate} parentId={node.id} siblingParentId={node.parentId} /> : null}</div>}
    </div>
    {(children.length || temporaryChild) ? <ul className={styles.treeChildren} hidden={!expanded} id={childrenId}>
      {children.map((child) => <Branch key={child.id} {...{ childrenByParent, editing, expandedIds, focusNodeId: _focusNodeId, node: child, nodeRefs, nodes: [], onCancelEdit, onCommitEdit, onCreate, onSelect, onToggle, selectedId, visited: nextVisited }} />)}
      {temporaryChild ? <TemporaryRow {...{ editing, onCancelEdit, onCommitEdit }} /> : null}
    </ul> : null}
  </li>
}

export function NoteTree({ nodes, selectedId, expandedIds, editing, focusNodeId, onCancelEdit, onCommitEdit, onCreate, onSelect, onSelectRoot, onToggle }: NoteTreeProps) {
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())
  const childrenByParent = new Map<string | null, KnowledgeNode[]>()
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }
  for (const siblings of childrenByParent.values()) siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const visibleIds = new Set(nodes.map((node) => node.id))
  const roots = nodes.filter((node) => node.parentId === null || !visibleIds.has(node.parentId))
  const temporaryRoot = editing?.mode === "create" && editing.parentId === null

  useEffect(() => {
    if (editing || !focusNodeId) return
    const timer = window.setTimeout(() => nodeRefs.current.get(focusNodeId)?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [editing, focusNodeId])

  if (!roots.length && !temporaryRoot && !onSelectRoot) return <p className={styles.treeEmptyMessage}>这里还没有已删除项目。</p>
  return <ul className={styles.treeList}>
    {onSelectRoot ? <li className={styles.treeRootItem}>
      <div className={styles.treeRow}>
        <span className={styles.treeTogglePlaceholder} />
        <div className={styles.treeNodeGroup}><button aria-current={selectedId === null ? "page" : undefined} className={styles.treeNode} onClick={() => void onSelectRoot()} type="button"><FolderOpen aria-hidden="true" size={16} /><span className={styles.treeLabel}>笔记库</span></button>{selectedId === null && onCreate ? <NewKnowledgeNodeMenu containerTitle="笔记库" onSelect={onCreate} parentId={null} /> : null}</div>
      </div>
      {!roots.length && !temporaryRoot ? <p className={styles.treeEmptyMessage}>知识树还是空的，请从笔记库开始建立。</p> : null}
    </li> : null}
    {roots.map((node) => <Branch key={node.id} {...{ childrenByParent, editing, expandedIds, focusNodeId, node, nodeRefs, nodes, onCancelEdit, onCommitEdit, onCreate, onSelect, onToggle, selectedId, visited: new Set() }} />)}
    {temporaryRoot ? <TemporaryRow {...{ editing, onCancelEdit, onCommitEdit }} /> : null}
  </ul>
}
