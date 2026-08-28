import { VeloLogo } from "@/components/brand/VeloLogo"
import styles from "./LaunchScreen.module.css"

interface LaunchScreenProps {
  onComplete: () => void
}

export function LaunchScreen({ onComplete }: LaunchScreenProps) {
  return (
    <section aria-label="Velow Notebook 欢迎页" className={styles.screen}>
      <VeloLogo animated className={styles.brandLogo} layout="vertical" />
      <div className={styles.message}>
        <p className={styles.promise}>
          <span>Catch ideas</span>
          <span>Keep flowing</span>
        </p>
      </div>
      <button className={styles.startButton} onClick={onComplete} type="button">
        Get started
      </button>
    </section>
  )
}
