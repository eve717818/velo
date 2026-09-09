import { Plus } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import styles from "./NotesWorkspace.module.css"

interface TreeNodeEditorProps {
  ariaLabel: string
  initialValue: string
  onCancel: () => void
  onCommit: (title: string) => void | Promise<void>
  showSubmitPlus?: boolean
}

export function TreeNodeEditor({ ariaLabel, initialValue, onCancel, onCommit, showSubmitPlus = false }: TreeNodeEditorProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function commit() {
    try {
      setError("")
      await onCommit(value.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试")
    }
  }

  return (
    <div className={styles.treeNodeEditor}>
      <div className={styles.treeNodeEditorControls}>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          aria-label={ariaLabel}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === "Enter") { event.preventDefault(); void commit() }
            if (event.key === "Escape") { event.preventDefault(); onCancel() }
          }}
          ref={inputRef}
          type="text"
          value={value}
        />
        {showSubmitPlus ? <button aria-label={`保存${ariaLabel}`} className={styles.treeNodeEditorSubmit} onClick={() => void commit()} type="button"><Plus aria-hidden="true" /></button> : null}
      </div>
      {error ? <p id={errorId} role="alert">{error}</p> : null}
    </div>
  )
}
