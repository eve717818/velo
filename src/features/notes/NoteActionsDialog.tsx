import { useId, useState } from "react"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"

interface NoteActionsDialogProps {
  node: KnowledgeNode
  nodes: KnowledgeNode[]
  onAddChild: () => void | Promise<void>
  onAddSibling: () => void | Promise<void>
  onMove: (parentId: string | null, inbox: boolean) => void | Promise<void>
  onRequestClose: () => void
  onRequestTrash: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
}
function descendantsOf(nodes: KnowledgeNode[], nodeId: string) {
  const excluded = new Set([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && excluded.has(node.parentId) && !excluded.has(node.id)) {
        excluded.add(node.id)
        changed = true
      }
    }
  }
  return excluded
}

export function NoteActionsDialog(props: NoteActionsDialogProps) {
  const titleId = useId()
  const [destination, setDestination] = useState("")
  const unavailable = descendantsOf(props.nodes, props.node.id)
  const destinations = props.nodes.filter((node) => node.deletedAt === undefined && !unavailable.has(node.id))

  return (
    <PlanDialog labelledBy={titleId} onRequestClose={props.onRequestClose} open={props.open} returnFocusTo={props.returnFocusTo}>
      <section className={styles.actionSheet}>
        <header>
          <div><p>笔记操作</p><h2 id={titleId}>{props.node.title}</h2></div>
          <button aria-label="关闭笔记操作" onClick={props.onRequestClose} type="button">×</button>
        </header>
        <div className={styles.actionGrid}>
          <button onClick={() => void props.onAddChild()} type="button">新建子笔记</button>
          <button onClick={() => void props.onAddSibling()} type="button">新建同级笔记</button>
          <button onClick={() => void props.onMove(null, true)} type="button">移到收件箱</button>
        </div>
        <label className={styles.destinationField}>
          <span>移动到目录</span>
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">选择目标笔记</option>
            {destinations.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
          </select>
        </label>
        <button className={styles.moveButton} disabled={!destination} onClick={() => void props.onMove(destination, false)} type="button">确认移动</button>
        <button className={styles.trashButton} onClick={props.onRequestTrash} type="button">移到回收站</button>
      </section>
    </PlanDialog>
  )
}
