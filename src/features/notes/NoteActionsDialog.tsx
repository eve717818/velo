import { useId, useMemo, useState } from "react"
import { PlanDialog } from "@/features/plans/components/PlanDialog"
import type { KnowledgeNode } from "@/db/types"
import styles from "./NotesWorkspace.module.css"

interface NoteActionsDialogProps {
  node: KnowledgeNode
  nodes: KnowledgeNode[]
  onMove: (parentId: string | null) => void | Promise<void>
  onRename: () => boolean | void | Promise<boolean | void>
  onRequestClose: () => void
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
  return <PlanDialog labelledBy={titleId} onRequestClose={props.onRequestClose} open={props.open} returnFocusTo={props.returnFocusTo}>
    {props.open ? <ActionSheet key={props.node.id} titleId={titleId} {...props} /> : null}
  </PlanDialog>
}

function ActionSheet({ titleId, ...props }: NoteActionsDialogProps & { titleId: string }) {
  const [moveState, setMoveState] = useState({ destination: null as string | null, error: "", open: false })
  const destinations = useMemo(() => {
    const unavailable = descendantIds(props.nodes, props.node.id)
    return props.nodes.filter((node) => node.type === "folder" && node.deletedAt === undefined && !unavailable.has(node.id))
  }, [props.node.id, props.nodes])
  const kind = props.node.type === "folder" ? "文件夹" : "笔记"

  async function closeForNextAction(action: () => boolean | void | Promise<boolean | void>) {
    const started = await action()
    if (started !== false) props.onRequestClose()
  }

  async function confirmMove() {
    if (moveState.destination !== null && !destinations.some((node) => node.id === moveState.destination)) {
      setMoveState({ ...moveState, error: "目标文件夹已不可用，请重新选择。" })
      return
    }
    try {
      setMoveState({ ...moveState, error: "" })
      await props.onMove(moveState.destination)
    } catch (error) {
      setMoveState({ ...moveState, error: error instanceof Error ? error.message : "移动失败，请重新选择目标文件夹。" })
    }
  }

  return (
      <section className={styles.actionSheet}>
        <header>
          <div><p>{kind}操作</p><h2 id={titleId}>{props.node.title}</h2></div>
          <button aria-label={`关闭${kind}操作`} onClick={props.onRequestClose} type="button">×</button>
        </header>
        <div className={styles.actionGrid}>
          <button onClick={() => void closeForNextAction(props.onRename)} type="button">重命名</button>
          <button onClick={() => setMoveState({ ...moveState, error: "", open: !moveState.open })} type="button">移动</button>
        </div>
        {moveState.open ? (
          <>
            <label className={styles.destinationField}>
              <span>移动到目录</span>
              <select aria-describedby={moveState.error ? "move-destination-error" : undefined} aria-invalid={moveState.error ? true : undefined} aria-label="移动到目录" onChange={(event) => setMoveState({ ...moveState, destination: event.target.value || null, error: "" })} value={moveState.destination ?? ""}>
                <option value="">笔记库根目录</option>
                {destinations.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
              </select>
            </label>
            {moveState.error ? <p className={styles.moveError} id="move-destination-error" role="alert">{moveState.error}</p> : null}
            <button className={styles.moveButton} onClick={() => void confirmMove()} type="button">确认移动</button>
          </>
        ) : null}
      </section>
  )
}
