import { type ReactNode, useEffect, useState } from "react"
import { VeloLogo } from "@/components/brand/VeloLogo"
import { seedHomeDemo } from "@/db/seed"
import { veloDb, type VeloDB } from "@/db/velo-db"
import { HomeLoadingCockpit } from "@/features/home/components/HomeLoadingCockpit"
import homeStyles from "@/features/home/HomePage.module.css"
import { MobileHeader } from "./MobileHeader"
import styles from "./LocalDataBootstrap.module.css"

interface LocalDataBootstrapProps {
  children: ReactNode
  db?: VeloDB
}

type BootstrapState = "loading" | "ready" | "error"

const seedPromises = new WeakMap<VeloDB, Promise<void>>()

function seedOnce(db: VeloDB) {
  const activeSeed = seedPromises.get(db)
  if (activeSeed) return activeSeed

  const seed = seedHomeDemo(db, new Date()).catch((error: unknown) => {
    seedPromises.delete(db)
    throw error
  })
  seedPromises.set(db, seed)
  return seed
}

export function LocalDataBootstrap({ children, db = veloDb }: LocalDataBootstrapProps) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<BootstrapState>("loading")

  useEffect(() => {
    let active = true

    seedOnce(db).then(
      () => {
        if (active) setState("ready")
      },
      () => {
        if (active) setState("error")
      },
    )

    return () => {
      active = false
    }
  }, [attempt, db])

  if (state === "ready") return children

  if (state === "error") {
    return (
      <main className={styles.errorState}>
        <div>
          <h1>本地数据初始化失败</h1>
          <p>请检查浏览器存储权限后重试。</p>
          <button
            onClick={() => {
              setState("loading")
              setAttempt((value) => value + 1)
            }}
            type="button"
          >
            重试
          </button>
        </div>
      </main>
    )
  }

  return (
    <div aria-busy="true" aria-label="正在准备本地学习数据" className={styles.bootstrapShell} role="group">
      <MobileHeader />
      <aside className={styles.loadingRail} aria-hidden="true">
        <VeloLogo className={styles.loadingRailLogo} />
        <div className={styles.loadingRailNavigation}>
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </aside>
      <div className={styles.loadingContent}>
        <main className={homeStyles.page}>
          <HomeLoadingCockpit />
        </main>
      </div>
      <div className={styles.loadingMobileNavigation} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <span aria-label="正在准备本地学习数据" className={styles.visuallyHidden} role="status">
        正在准备本地学习数据
      </span>
    </div>
  )
}
