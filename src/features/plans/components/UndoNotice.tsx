import styles from "./TaskBar.module.css"

interface UndoNoticeProps {
  onUndo: () => void
}

export function UndoNotice({ onUndo }: UndoNoticeProps) {
  return (
    <div aria-live="polite" className={styles.undoNotice} role="status">
      <span>任务已完成</span>
      <button onClick={onUndo} type="button">撤销</button>
    </div>
  )
}
