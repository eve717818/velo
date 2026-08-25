import { Outlet } from "react-router-dom"
import { VeloLogo } from "@/components/brand/VeloLogo"
import { MobileTopMenu } from "@/components/navigation/MobileTopMenu"
import { PrimaryNav } from "@/components/navigation/PrimaryNav"
import styles from "./AppShell.module.css"

export function AppShell() {
  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Velo 侧边栏">
        <VeloLogo className={styles.railLogo} />
        <PrimaryNav variant="rail" />
      </aside>
      <header className={styles.mobileHeader}>
        <VeloLogo compact className={styles.mobileLogo} />
        <MobileTopMenu />
      </header>
      <div className={styles.content}>
        <Outlet />
      </div>
      <div className={styles.mobileNavigation}>
        <PrimaryNav variant="mobile" />
      </div>
    </div>
  )
}
