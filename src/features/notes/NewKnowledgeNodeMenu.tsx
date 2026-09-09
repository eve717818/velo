import { useEffect, useRef, useState } from "react"
import { FolderPlus, NotebookPen, Plus } from "lucide-react"
import styles from "./NotesWorkspace.module.css"

export type NewKnowledgeNodeSelection = {
  type: "folder" | "note"
  parentId: string | null
}

interface NewKnowledgeNodeMenuProps {
  containerTitle: string
  parentId?: string | null
  onSelect: (selection: NewKnowledgeNodeSelection, returnFocusTo: HTMLButtonElement | null) => void | Promise<boolean>
}

export function NewKnowledgeNodeMenu({ containerTitle, parentId = null, onSelect }: NewKnowledgeNodeMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(false)
      queueMicrotask(() => triggerRef.current?.focus())
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  async function choose(type: NewKnowledgeNodeSelection["type"]) {
    const started = await onSelect({ type, parentId }, triggerRef.current)
    if (started !== false) setOpen(false)
  }

  return (
    <div className={styles.newNodeMenu}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={`在${containerTitle}中新建`} className={styles.contextualCreateButton} onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
        <Plus aria-hidden="true" />
      </button>
      {open ? (
        <div aria-label="新建节点" className={styles.newNodeMenuPopup} role="menu">
          <button onClick={() => void choose("folder")} role="menuitem" type="button"><FolderPlus aria-hidden="true" />新建文件夹</button>
          <button onClick={() => void choose("note")} role="menuitem" type="button"><NotebookPen aria-hidden="true" />新建笔记</button>
        </div>
      ) : null}
    </div>
  )
}
