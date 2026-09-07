import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react"
import { useId } from "react"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"

interface NoteTreeProps {
  nodes: KnowledgeNode[]
  selectedId: string | null
  expandedIds: Set<string>
  onSelect: (node: KnowledgeNode) => void | Promise<void>
  onToggle: (nodeId: string) => void | Promise<void>
}
interface BranchProps extends NoteTreeProps {
  node: KnowledgeNode
  childrenByParent: Map<string | null, KnowledgeNode[]>
  visited: Set<string>
}

function Branch({ node, childrenByParent, visited, selectedId, expandedIds, onSelect, onToggle }: BranchProps) {
  const childrenId = useId()
  if (visited.has(node.id)) return null
  const nextVisited = new Set(visited).add(node.id)
  const children = childrenByParent.get(node.id) ?? []
  const expandable = node.type === "folder" && children.length > 0
  const expanded = expandable && expandedIds.has(node.id)
  const NodeIcon = node.type === "folder" ? (expanded ? FolderOpen : Folder) : FileText
  return (
    <li>
      <div className={styles.treeRow}>
        {expandable ? (
          <button
            aria-controls={childrenId}
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}${node.title}`}
            className={styles.treeToggle}
            onClick={() => void onToggle(node.id)}
            type="button"
          >
            {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ) : <span className={styles.treeTogglePlaceholder} />}
        <button
          aria-current={selectedId === node.id ? "page" : undefined}
          aria-label={node.type === "folder" ? node.title : `打开笔记：${node.title}`}
          className={styles.treeNode}
          onClick={() => void onSelect(node)}
          type="button"
        >
          <NodeIcon aria-hidden="true" size={16} />
          <span className={styles.treeLabel}>{node.title}</span>
        </button>
      </div>
      {children.length ? (
        <ul className={styles.treeChildren} hidden={!expanded} id={childrenId}>
          {children.map((child) => (
            <Branch key={child.id} {...{ childrenByParent, expandedIds, node: child, nodes: [], onSelect, onToggle, selectedId, visited: nextVisited }} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function NoteTree({ nodes, selectedId, expandedIds, onSelect, onToggle }: NoteTreeProps) {
  const childrenByParent = new Map<string | null, KnowledgeNode[]>()
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }
  for (const siblings of childrenByParent.values()) siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const visibleIds = new Set(nodes.map((node) => node.id))
  const roots = nodes.filter((node) => node.parentId === null || !visibleIds.has(node.parentId))

  if (!roots.length) return <p className={styles.treeEmpty}>这里还没有笔记。</p>
  return (
    <ul className={styles.treeList}>
      {roots.map((node) => (
        <Branch key={node.id} {...{ childrenByParent, expandedIds, node, nodes, onSelect, onToggle, selectedId, visited: new Set() }} />
      ))}
    </ul>
  )
}
