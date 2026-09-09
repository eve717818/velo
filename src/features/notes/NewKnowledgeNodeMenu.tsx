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
  siblingParentId?: string | null
  onSelect: (selection: NewKnowledgeNodeSelection, returnFocusTo: HTMLButtonElement | null) => void | Promise<boolean>
}

export function NewKnowledgeNodeMenu({ containerTitle, parentId = null, siblingParentId, onSelect }: NewKnowledgeNodeMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const createsRootFolderDirectly = siblingParentId === undefined

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

  async function choose(type: NewKnowledgeNodeSelection["type"], targetParentId = parentId) {
    const started = await onSelect({ type, parentId: targetParentId }, triggerRef.current)
    if (started !== false) setOpen(false)
  }

  return (
    <div className={open ? `${styles.newNodeMenu} ${styles.newNodeMenuOpen}` : styles.newNodeMenu}>
      <button aria-expanded={createsRootFolderDirectly ? undefined : open} aria-haspopup={createsRootFolderDirectly ? undefined : "menu"} aria-label={createsRootFolderDirectly ? `在${containerTitle}中新建文件夹` : `在${containerTitle}中新建`} className={styles.contextualCreateButton} onClick={() => createsRootFolderDirectly ? void choose("folder") : setOpen((value) => !value)} ref={triggerRef} type="button">
        <Plus aria-hidden="true" />
      </button>
      {!createsRootFolderDirectly && open ? (
        <div aria-label="新建节点" className={styles.newNodeMenuPopup} role="menu">
          {siblingParentId === undefined ? <button onClick={() => void choose("folder")} role="menuitem" type="button"><FolderPlus aria-hidden="true" />新建文件夹</button> : <>
            <button onClick={() => void choose("folder", siblingParentId)} role="menuitem" type="button"><FolderPlus aria-hidden="true" />新建同级文件夹</button>
            <button onClick={() => void choose("folder")} role="menuitem" type="button"><FolderPlus aria-hidden="true" />新建下一级文件夹</button>
          </>}
          <button onClick={() => void choose("note")} role="menuitem" type="button"><NotebookPen aria-hidden="true" />新建笔记</button>
        </div>
      ) : null}
    </div>
  )
}
