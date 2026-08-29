import styles from "./TaskBar.module.css"

interface UndoNoticeProps {
  message?: string
  onUndo: () => void
}

export function UndoNotice({ message = "任务已完成", onUndo }: UndoNoticeProps) {
  return (
    <div aria-live="polite" className={styles.undoNotice} role="status">
      <span>{message}</span>
      <button onClick={onUndo} style={{ minHeight: 44 }} type="button">撤销</button>
    </div>
  )
}
