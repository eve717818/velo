export type EditorMode = "edit" | "read" | "split"
export type SaveStatus = "loading" | "saved" | "saving" | "dirty" | "failed" | "conflict"

export interface StoredNoteDraft {
  title: string
  markdown: string
  baseRevision: number
  updatedAt: number
}
export function draftStorageKey(nodeId: string) {
  return `velow-note-draft:${nodeId}`
}

export function readStoredDraft(nodeId: string): StoredNoteDraft | null {
  try {
    const value = localStorage.getItem(draftStorageKey(nodeId))
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<StoredNoteDraft>
    if (typeof parsed.title !== "string" || typeof parsed.markdown !== "string" || typeof parsed.baseRevision !== "number") return null
    return { title: parsed.title, markdown: parsed.markdown, baseRevision: parsed.baseRevision, updatedAt: Number(parsed.updatedAt) || 0 }
  } catch {
    return null
  }
}

export function writeStoredDraft(nodeId: string, draft: StoredNoteDraft) {
  try {
    localStorage.setItem(draftStorageKey(nodeId), JSON.stringify(draft))
  } catch {
    // The in-memory editor remains the primary recovery path when storage is restricted.
  }
}

export function clearStoredDraft(nodeId: string) {
  try {
    localStorage.removeItem(draftStorageKey(nodeId))
  } catch {
    // A stale recovery draft is harmless and can be replaced by the next edit.
  }
}
