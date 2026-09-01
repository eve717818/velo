import { ArrowRight } from "lucide-react"
import { useState } from "react"

import styles from "../PlansPage.module.css"

const storageKey = "velow.plan.swipe-hint-dismissed"

function wasDismissed() {
  try {
    return localStorage.getItem(storageKey) === "1"
  } catch {
    return false
  }
}

export function SwipeDiscoveryHint({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(wasDismissed)
  if (!visible || dismissed) return null

  function dismiss() {
    try { localStorage.setItem(storageKey, "1") } catch { /* private browsing can reject storage */ }
    setDismissed(true)
  }

  return (
    <aside className={styles.swipeDiscoveryHint}>
      <span className={styles.swipeDiscoveryIcon}><ArrowRight aria-hidden size={18} /></span>
      <span><strong>右滑任务卡片即可完成</strong><small>箭头会跟随手指，松手后仍可撤销。</small></span>
      <button onClick={dismiss} type="button">知道了</button>
    </aside>
  )
}
