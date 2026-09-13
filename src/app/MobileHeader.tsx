import { Bell, BellOff } from "lucide-react"
import { useState } from "react"
import { VeloLogo } from "@/components/brand/VeloLogo"
import { MobileTopMenu } from "@/components/navigation/MobileTopMenu"
import styles from "./AppShell.module.css"

export function MobileHeader() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem('velow:reminders-muted') === '1' } catch { return false }
  })
  const [notice, setNotice] = useState('')
  function toggleReminders() {
    const next = !muted
    try {
      localStorage.setItem('velow:reminders-muted', next ? '1' : '0')
      setMuted(next)
      setNotice(next ? '提醒开关已关闭。计时与记录不受影响。' : '提醒开关已开启；系统提醒功能尚未接入。')
    } catch { setNotice('无法保存提醒设置，请检查浏览器存储权限。') }
  }
  return (
    <header className={styles.mobileHeader}>
      <VeloLogo className={styles.mobileLogo} />
      <div className={styles.mobileActions}>
        <button aria-label={muted ? '开启提醒' : '关闭提醒'} aria-pressed={muted} className={styles.mobileNotification} onClick={toggleReminders} type="button">
          {muted ? <BellOff aria-hidden="true" size={23} strokeWidth={1.9} /> : <Bell aria-hidden="true" size={23} strokeWidth={1.9} />}
        </button>
        <MobileTopMenu />
        {notice && <div className={styles.reminderNotice} role="status"><span>{notice}</span><button onClick={() => setNotice('')} type="button" aria-label="关闭提醒设置提示">×</button></div>}
      </div>
    </header>
  )
}
