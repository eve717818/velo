import { veloDb } from "@/db/velo-db"
import { NotesWorkspace } from "@/features/notes/NotesWorkspace"

export function NotesPage() {
  return <NotesWorkspace db={veloDb} />
}
