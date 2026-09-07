import { useId, useMemo, useState } from "react"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"

interface NoteActionsDialogProps {
  node: KnowledgeNode
  nodes: KnowledgeNode[]
  onAdd: (type: "folder" | "note", parentId: string | null) => void
  onMove: (parentId: string | null) => void | Promise<void>
  onRename: () => void
  onRequestClose: () => void
  onRequestTrash: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
}

function descendantIds(nodes: KnowledgeNode[], nodeId: string) {
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
  const [destination, setDestination] = useState<string | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const destinations = useMemo(() => {
    const unavailable = descendantIds(props.nodes, props.node.id)
    return props.nodes.filter((node) => node.type === "folder" && node.deletedAt === undefined && !unavailable.has(node.id))
  }, [props.node.id, props.nodes])
  const kind = props.node.type === "folder" ? "文件夹" : "笔记"

  function closeForNextAction(action: () => void) {
    props.onRequestClose()
    action()
  }

  return (
    <PlanDialog labelledBy={titleId} onRequestClose={props.onRequestClose} open={props.open} returnFocusTo={props.returnFocusTo}>
      <section className={styles.actionSheet}>
        <header>
          <div><p>{kind}操作</p><h2 id={titleId}>{props.node.title}</h2></div>
          <button aria-label={`关闭${kind}操作`} onClick={props.onRequestClose} type="button">×</button>
        </header>
        <div className={styles.actionGrid}>
          {props.node.type === "folder" ? (
            <>
              <button onClick={() => closeForNextAction(() => props.onAdd("folder", props.node.id))} type="button">新建子文件夹</button>
              <button onClick={() => closeForNextAction(() => props.onAdd("note", props.node.id))} type="button">新建笔记</button>
            </>
          ) : (
            <>
              <button onClick={() => closeForNextAction(() => props.onAdd("note", props.node.parentId))} type="button">新建同级笔记</button>
              <button onClick={() => closeForNextAction(() => props.onAdd("folder", props.node.parentId))} type="button">新建同级文件夹</button>
            </>
          )}
          <button onClick={() => closeForNextAction(props.onRename)} type="button">重命名</button>
          <button onClick={() => setMoveOpen((value) => !value)} type="button">移动</button>
        </div>
        {moveOpen ? (
          <>
            <label className={styles.destinationField}>
              <span>移动到目录</span>
              <select aria-label="移动到目录" onChange={(event) => setDestination(event.target.value || null)} value={destination ?? ""}>
                <option value="">笔记库根目录</option>
                {destinations.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
              </select>
            </label>
            <button className={styles.moveButton} onClick={() => void props.onMove(destination)} type="button">确认移动</button>
          </>
        ) : null}
        <button className={styles.trashButton} onClick={props.onRequestTrash} type="button">移到回收站</button>
      </section>
    </PlanDialog>
  )
}
