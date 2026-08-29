import styles from "./PlanDialog.module.css"

interface PlanErrorStateProps {
  error?: string
  onRetry: () => void
}

export function PlanErrorState({ error, onRetry }: PlanErrorStateProps) {
  return (
    <div className={styles.saveError} role="alert">
      <span>保存失败，请重试{error ? `：${error}` : ""}</span>
      <button className={styles.retryButton} onClick={onRetry} type="button">重试</button>
    </div>
  )
}
