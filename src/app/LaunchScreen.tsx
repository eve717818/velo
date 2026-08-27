import { VeloLogo } from "@/components/brand/VeloLogo"
import styles from "./LaunchScreen.module.css"

export function LaunchScreen() {
  return (
    <div aria-label="Velo 正在启动" className={styles.screen} role="status">
      <div className={styles.brandMoment}>
        <span className={styles.loop} aria-hidden="true">
          <VeloLogo compact />
        </span>
        <p className={styles.promise}>
          <span>Catch ideas,</span>
          <span>Keep flowing</span>
        </p>
      </div>
    </div>
  )
}
