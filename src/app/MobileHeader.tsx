import { Bell } from "lucide-react"
import { VeloLogo } from "@/components/brand/VeloLogo"
import { MobileTopMenu } from "@/components/navigation/MobileTopMenu"
import styles from "./AppShell.module.css"

export function MobileHeader() {
  return (
    <header className={styles.mobileHeader}>
      <VeloLogo className={styles.mobileLogo} />
      <div className={styles.mobileActions}>
        <button aria-label="通知" className={styles.mobileNotification} type="button">
          <Bell aria-hidden="true" size={23} strokeWidth={1.9} />
        </button>
        <MobileTopMenu />
      </div>
    </header>
  )
}
