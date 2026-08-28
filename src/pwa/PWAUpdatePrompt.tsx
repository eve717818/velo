import { Download, WifiOff, X } from "lucide-react"
import styles from "./RegisterPWA.module.css"

interface PWAUpdatePromptProps {
  offlineReady: boolean
  needRefresh: boolean
  onReload: () => void
  onClose: () => void
}

export function PWAUpdatePrompt({
  offlineReady,
  needRefresh,
  onReload,
  onClose,
}: PWAUpdatePromptProps) {
  if (!offlineReady && !needRefresh) return null

  return (
    <section aria-live="polite" className={styles.prompt} role="status">
      <span className={styles.icon} aria-hidden="true">
        {needRefresh ? <Download size={20} /> : <WifiOff size={20} />}
      </span>
      <div className={styles.copy}>
        <strong>{needRefresh ? "发现 Velow Notebook 新版本" : "应用已可离线使用"}</strong>
        <span>{needRefresh ? "更新后将自动重新载入。" : "断网时也可以继续查看本地内容。"}</span>
      </div>
      {needRefresh ? (
        <button className={styles.updateButton} onClick={onReload} type="button">
          立即更新
        </button>
      ) : null}
      <button aria-label="关闭提示" className={styles.closeButton} onClick={onClose} type="button">
        <X aria-hidden="true" size={18} />
      </button>
    </section>
  )
}
