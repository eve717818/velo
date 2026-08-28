import { Outlet, useLocation } from "react-router-dom"
import { VeloLogo } from "@/components/brand/VeloLogo"
import { PageTransition } from "@/components/motion/PageTransition"
import { PrimaryNav } from "@/components/navigation/PrimaryNav"
import { MobileHeader } from "./MobileHeader"
import styles from "./AppShell.module.css"

export function AppShell() {
  const location = useLocation()

  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Velow Notebook 侧边栏">
        <VeloLogo className={styles.railLogo} />
        <PrimaryNav variant="rail" />
      </aside>
      <MobileHeader />
      <div className={styles.content}>
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
      </div>
      <div className={styles.mobileNavigation}>
        <PrimaryNav variant="mobile" />
      </div>
    </div>
  )
}
