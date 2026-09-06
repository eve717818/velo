import type { KnowledgeNode, LegacyKnowledgeNode, NoteDocument } from "@/db/types"

export function isDocumentEmpty(document: NoteDocument | undefined): boolean {
  if (!document) return true
  if (document.markdown?.trim() || document.plainText.trim()) return false
  return !hasMeaningfulStructuredValue(document.content)
}

export function validateKnowledgeTree(nodes: KnowledgeNode[], documents: NoteDocument[]): void {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, KnowledgeNode[]>()
  const documentsByNode = new Map<string, NoteDocument[]>()

  for (const node of nodes) {
    if (node.parentId === null) continue
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }

  for (const document of documents) {
    const related = documentsByNode.get(document.nodeId) ?? []
    related.push(document)
    documentsByNode.set(document.nodeId, related)
  }

  for (const node of nodes) {
    const nodeDocuments = documentsByNode.get(node.id) ?? []
    const nodeChildren = childrenByParent.get(node.id) ?? []

    if (node.type === "folder" && nodeDocuments[0]) throw new Error("文件夹不能包含正文")
    if (node.type === "note" && nodeChildren.length) throw new Error("笔记不能包含子节点")
    if (node.type === "note" && nodeDocuments.length !== 1) throw new Error("笔记正文关联异常")

    if (node.parentId !== null) {
      const parent = nodesById.get(node.parentId)
      if (parent?.type !== "folder") throw new Error("父节点必须是文件夹")
    }

    const visited = new Set<string>()
    let cursor: KnowledgeNode | undefined = node
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error("目录结构存在循环")
      visited.add(cursor.id)
      cursor = cursor.parentId === null ? undefined : nodesById.get(cursor.parentId)
    }
  }
}

export function migrateLegacyKnowledgeTree(
  nodes: LegacyKnowledgeNode[],
  documents: NoteDocument[],
): { nodes: KnowledgeNode[]; documents: NoteDocument[] } {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const documentsByNode = new Map<string, NoteDocument[]>()

  for (const node of nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) throw new Error("父节点不存在")
  }

  for (const document of documents) {
    if (!nodeIds.has(document.nodeId)) throw new Error("正文引用的节点不存在")
    const related = documentsByNode.get(document.nodeId) ?? []
    related.push(document)
    documentsByNode.set(document.nodeId, related)
    if (related.length > 1) throw new Error("节点存在多个正文")
  }

  const migratedNodes = nodes.map((legacyNode): KnowledgeNode => {
    const { inbox, ...currentNode } = legacyNode
    void inbox
    return { ...currentNode }
  })
  const migratedDocuments = documents.map((document) => ({
    ...document,
    content: { ...document.content },
  }))
  const migratedDocumentsByNode = new Map(migratedDocuments.map((document) => [document.nodeId, document]))
  const childCounts = new Map<string, number>()

  for (const node of migratedNodes) {
    if (node.parentId !== null) childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1)
  }

  const usedNodeIds = new Set(nodeIds)
  const usedDocumentIds = new Set(documents.map((document) => document.id))
  const removedDocumentIds = new Set<string>()
  const overviewNodes: KnowledgeNode[] = []
  const createdDocuments: NoteDocument[] = []

  for (const node of migratedNodes) {
    const hasChildren = (childCounts.get(node.id) ?? 0) > 0
    const nodeDocument = migratedDocumentsByNode.get(node.id)

    if (hasChildren) {
      node.type = "folder"
      if (!nodeDocument) continue
      if (isDocumentEmpty(nodeDocument)) {
        removedDocumentIds.add(nodeDocument.id)
        continue
      }

      const overviewId = nextAvailableId(`${node.id}--overview`, usedNodeIds)
      usedNodeIds.add(overviewId)
      for (const child of migratedNodes) {
        if (child.parentId === node.id) child.order += 1
      }
      overviewNodes.push({
        id: overviewId,
        parentId: node.id,
        type: "note",
        title: "概览",
        order: 0,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      })
      nodeDocument.nodeId = overviewId
      continue
    }

    node.type = "note"
    if (nodeDocument) continue

    const documentId = nextAvailableId(`${node.id}--document`, usedDocumentIds)
    usedDocumentIds.add(documentId)
    createdDocuments.push({
      id: documentId,
      nodeId: node.id,
      title: node.title,
      content: { type: "doc" },
      plainText: "",
      markdown: "",
      revision: 0,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    })
  }

  const result = {
    nodes: [...migratedNodes, ...overviewNodes],
    documents: [
      ...migratedDocuments.filter((document) => !removedDocumentIds.has(document.id)),
      ...createdDocuments,
    ],
  }
  validateKnowledgeTree(result.nodes, result.documents)
  return result
}

function nextAvailableId(base: string, usedIds: Set<string>): string {
  if (!usedIds.has(base)) return base
  let suffix = 2
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function hasMeaningfulStructuredValue(value: unknown, key?: string): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return key !== "type" && value.trim().length > 0
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return true
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulStructuredValue(item))
  if (typeof value !== "object") return false
  return Object.entries(value).some(([entryKey, entryValue]) => hasMeaningfulStructuredValue(entryValue, entryKey))
}
