import { useLiveQuery } from "dexie-react-hooks"
import { veloDb, type VeloDB } from "@/db/velo-db"
import { formatLocalDate } from "@/lib/local-date"
import { loadHomeSnapshot, type HomeSnapshot } from "./home-query"

export function useHomeSnapshot(db: VeloDB = veloDb, now: Date = new Date()): HomeSnapshot | undefined {
  const periodKey = formatLocalDate(now)

  return useLiveQuery(() => loadHomeSnapshot(db, now), [db, periodKey])
}
