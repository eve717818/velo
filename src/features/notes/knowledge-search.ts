import type { KnowledgeNode, NoteDocument } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

export interface KnowledgeSearchResult {
  id: string
  type: "folder" | "note"
  title: string
  path: string
  snippet: string
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function bodySnippet(document: NoteDocument | undefined, normalizedQuery: string) {
  const text = normalizedText(document?.plainText || document?.markdown || "")
  const index = text.toLocaleLowerCase().indexOf(normalizedQuery)
  if (index < 0) return ""
  const start = Math.max(0, index - 28)
  const end = Math.min(text.length, index + normalizedQuery.length + 42)
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

function fullPath(node: KnowledgeNode, byId: Map<string, KnowledgeNode>) {
  const titles = [node.title]
  const visited = new Set([node.id])
  let cursor = node
  while (cursor.parentId) {
    if (visited.has(cursor.parentId)) break
    visited.add(cursor.parentId)
    const parent = byId.get(cursor.parentId)
    if (!parent) break
    titles.unshift(parent.title)
    cursor = parent
  }
  return ["笔记库", ...titles].join(" / ")
}

function visibleOrder(nodes: KnowledgeNode[]) {
  const byParent = new Map<string | null, KnowledgeNode[]>()
  const ids = new Set(nodes.map((node) => node.id))
  for (const node of nodes) {
    const parentId = node.parentId && ids.has(node.parentId) ? node.parentId : null
    const siblings = byParent.get(parentId) ?? []
    siblings.push(node)
    byParent.set(parentId, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const ordered: KnowledgeNode[] = []
  const visited = new Set<string>()
  function visit(node: KnowledgeNode) {
    if (visited.has(node.id)) return
    visited.add(node.id)
    ordered.push(node)
    for (const child of byParent.get(node.id) ?? []) visit(child)
  }
  for (const root of byParent.get(null) ?? []) visit(root)
  return ordered
}

export async function searchKnowledgeTree(db: VeloDB, query: string): Promise<KnowledgeSearchResult[]> {
  const normalizedQuery = normalizedText(query).toLocaleLowerCase()
  if (!normalizedQuery) return []
  const [allNodes, allDocuments] = await db.transaction("r", db.knowledgeNodes, db.notes, async () => (
    Promise.all([db.knowledgeNodes.toArray(), db.notes.toArray()])
  ))
  const nodes = allNodes.filter((node) => node.deletedAt === undefined)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const documents = new Map(allDocuments.map((document) => [document.nodeId, document]))

  return visibleOrder(nodes).flatMap((node) => {
    const titleMatch = node.title.toLocaleLowerCase().includes(normalizedQuery)
    const snippet = node.type === "note" && !titleMatch ? bodySnippet(documents.get(node.id), normalizedQuery) : ""
    if (!titleMatch && !snippet) return []
    return [{ id: node.id, type: node.type, title: node.title, path: fullPath(node, byId), snippet }]
  })
}
