import { type ReactNode, useEffect, useState } from "react"
import { seedHomeDemo } from "@/db/seed"
import { veloDb, type VeloDB } from "@/db/velo-db"
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
    <div aria-busy="true" aria-label="正在准备本地学习数据" className={styles.bootstrapShell} role="status">
      <aside className={styles.loadingRail} aria-hidden="true" />
      <main className={styles.loadingCanvas}>
        <span className={styles.visuallyHidden}>正在准备本地学习数据</span>
        <div className={styles.loadingHeader} aria-hidden="true" />
        <div className={styles.loadingGrid} aria-hidden="true">
          <div />
          <div />
          <div />
          <div />
        </div>
      </main>
    </div>
  )
}
