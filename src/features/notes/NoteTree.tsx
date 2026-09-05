import { ChevronDown, ChevronRight, FileText } from "lucide-react"
import { useState } from "react"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"

interface NoteTreeProps {
  nodes: KnowledgeNode[]
  selectedId: string | null
  onSelect: (nodeId: string) => void | Promise<void>
}
interface BranchProps extends NoteTreeProps {
  node: KnowledgeNode
  childrenByParent: Map<string | null, KnowledgeNode[]>
  depth: number
  visited: Set<string>
}

function Branch({ node, childrenByParent, depth, visited, selectedId, onSelect }: BranchProps) {
  const [expanded, setExpanded] = useState(true)
  if (visited.has(node.id)) return null
  const nextVisited = new Set(visited).add(node.id)
  const children = childrenByParent.get(node.id) ?? []
  return (
    <li>
      <div className={styles.treeRow} style={{ "--tree-depth": Math.min(depth, 4) } as React.CSSProperties}>
        {children.length ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}${node.title}`}
            className={styles.treeToggle}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ) : <span className={styles.treeTogglePlaceholder} />}
        <button
          aria-current={selectedId === node.id ? "page" : undefined}
          aria-label={`打开笔记：${node.title}`}
          className={styles.treeNode}
          onClick={() => void onSelect(node.id)}
          type="button"
        >
          <FileText aria-hidden="true" size={16} />
          <span>{node.title}</span>
        </button>
      </div>
      {expanded && children.length ? (
        <ul className={styles.treeList}>
          {children.map((child) => (
            <Branch key={child.id} {...{ childrenByParent, depth: depth + 1, node: child, nodes: [], onSelect, selectedId, visited: nextVisited }} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function NoteTree({ nodes, selectedId, onSelect }: NoteTreeProps) {
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
        <Branch key={node.id} {...{ childrenByParent, depth: 0, node, nodes, onSelect, selectedId, visited: new Set() }} />
      ))}
    </ul>
  )
}
