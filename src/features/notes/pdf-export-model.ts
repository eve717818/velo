import type { KnowledgeNode, NoteDocument } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"

export type PdfExportEntry =
  | { id: string; kind: "folder"; title: string; level: number }
  | { id: string; kind: "note"; title: string; level: number; markdown: string }

export interface PdfExportSnapshot {
  title: string
  filename: string
  hasNotes: boolean
  entries: PdfExportEntry[]
}

function safePdfFilename(title: string) {
  const cleaned = title.replace(/\s*[\\/:*?"<>|]+\s*/g, "-").replace(/\s+/g, " ").trim().replace(/^-+|-+$/g, "")
  return `${cleaned || "笔记"}.pdf`
}

function orderedChildren(nodes: KnowledgeNode[]) {
  const byParent = new Map<string | null, KnowledgeNode[]>()
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? []
    siblings.push(node)
    byParent.set(node.parentId, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  return byParent
}

export async function buildPdfExportSnapshot(db: VeloDB, selectedNodeId: string | null): Promise<PdfExportSnapshot> {
  const [allNodes, allDocuments] = await db.transaction("r", db.knowledgeNodes, db.notes, async () => (
    Promise.all([db.knowledgeNodes.toArray(), db.notes.toArray()])
  ))
  const nodes = allNodes.filter((node) => node.deletedAt === undefined)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = selectedNodeId === null ? null : byId.get(selectedNodeId)
  if (selectedNodeId !== null && !selected) throw new Error("导出范围不存在")

  const documents = new Map<string, NoteDocument>(allDocuments.map((document) => [document.nodeId, document]))
  const children = orderedChildren(nodes)
  const entries: PdfExportEntry[] = []
  const visited = new Set<string>()

  function visit(node: KnowledgeNode, level: number) {
    if (visited.has(node.id)) throw new Error("目录结构存在循环")
    visited.add(node.id)
    if (node.type === "folder") {
      entries.push({ id: node.id, kind: "folder", title: node.title, level })
      for (const child of children.get(node.id) ?? []) visit(child, level + 1)
      return
    }
    const document = documents.get(node.id)
    if (!document) throw new Error(`笔记“${node.title}”缺少正文，无法导出`)
    entries.push({ id: node.id, kind: "note", title: node.title, level, markdown: document.markdown ?? document.plainText })
  }

  if (selected) visit(selected, 0)
  else for (const node of children.get(null) ?? []) visit(node, 0)

  const title = selected?.title ?? "笔记库"
  return {
    title,
    filename: safePdfFilename(title),
    hasNotes: entries.some((entry) => entry.kind === "note"),
    entries,
  }
}
