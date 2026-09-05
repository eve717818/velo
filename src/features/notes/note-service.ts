import type { KnowledgeNode, NoteDocument } from "@/db/types"
import type { VeloDB } from "@/db/velo-db"
import { createId } from "@/lib/create-id"

type CreateNoteInput = {
  title: string
  parentId: string | null
  inbox: boolean
}

type SaveNoteInput = {
  title: string
  markdown: string
}

function isDeleted(node: KnowledgeNode) {
  return node.deletedAt !== undefined
}

function readableMarkdown(document: NoteDocument | undefined) {
  if (!document) return ""
  return typeof document.markdown === "string" ? document.markdown : document.plainText
}

function toPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, "$1")
    .replace(/^[\s>#*-]+/gm, "")
    .replace(/[#*_`]/g, "")
    .trim()
}

async function requireLiveNode(db: VeloDB, nodeId: string) {
  const node = await db.knowledgeNodes.get(nodeId)
  if (!node) throw new Error("笔记不存在")
  if (isDeleted(node)) throw new Error("笔记已在回收站")
  return node
}

async function nextOrder(db: VeloDB, parentId: string | null) {
  const siblings = (await db.knowledgeNodes.toArray()).filter((node) => node.parentId === parentId)
  return siblings.reduce((maximum, sibling) => Math.max(maximum, sibling.order), -1) + 1
}

async function ensureDocument(db: VeloDB, node: KnowledgeNode, now: number) {
  const existing = await db.notes.where("nodeId").equals(node.id).first()
  if (existing) return existing
  const document: NoteDocument = {
    id: createId(),
    nodeId: node.id,
    title: node.title,
    content: {},
    plainText: "",
    markdown: "",
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }
  await db.notes.add(document)
  return document
}

async function verifyNoCycle(db: VeloDB, nodeId: string, parentId: string | null) {
  const seen = new Set<string>()
  let cursor = parentId
  while (cursor !== null) {
    if (cursor === nodeId) throw new Error("不能移动到自身或子节点")
    if (seen.has(cursor)) throw new Error("目录结构存在循环，无法移动")
    seen.add(cursor)
    const parent = await db.knowledgeNodes.get(cursor)
    if (!parent || isDeleted(parent)) throw new Error("目标目录不存在或已删除")
    cursor = parent.parentId
  }
}

function orderedChildren(nodes: KnowledgeNode[]) {
  const children = new Map<string | null, KnowledgeNode[]>()
  for (const node of nodes) {
    const current = children.get(node.parentId) ?? []
    current.push(node)
    children.set(node.parentId, current)
  }
  for (const current of children.values()) {
    current.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  }
  return children
}

function collectSubtree(root: KnowledgeNode, children: Map<string | null, KnowledgeNode[]>) {
  const result: KnowledgeNode[] = []
  const visited = new Set<string>()
  const visit = (node: KnowledgeNode) => {
    if (visited.has(node.id)) return
    visited.add(node.id)
    result.push(node)
    for (const child of children.get(node.id) ?? []) visit(child)
  }
  visit(root)
  return result
}

export async function createNote(db: VeloDB, input: CreateNoteInput, now: number): Promise<KnowledgeNode> {
  let created!: KnowledgeNode
  await db.transaction("rw", db.knowledgeNodes, db.notes, async () => {
    if (input.parentId !== null) await requireLiveNode(db, input.parentId)
    const title = input.title.trim() || "未命名笔记"
    created = {
      id: createId(),
      parentId: input.parentId,
      type: "note",
      title,
      order: await nextOrder(db, input.parentId),
      inbox: input.parentId === null ? input.inbox : false,
      createdAt: now,
      updatedAt: now,
    }
    await db.knowledgeNodes.add(created)
    await ensureDocument(db, created, now)
  })
  return created
}

export async function loadNote(db: VeloDB, nodeId: string): Promise<NoteDocument> {
  let document!: NoteDocument
  await db.transaction("rw", db.knowledgeNodes, db.notes, async () => {
    const node = await requireLiveNode(db, nodeId)
    document = await ensureDocument(db, node, node.updatedAt)
  })
  return document
}

export async function saveNote(db: VeloDB, nodeId: string, input: SaveNoteInput, expectedRevision: number, now: number): Promise<NoteDocument> {
  let saved!: NoteDocument
  await db.transaction("rw", db.knowledgeNodes, db.notes, async () => {
    const node = await requireLiveNode(db, nodeId)
    const existing = await ensureDocument(db, node, now)
    const revision = existing.revision ?? 0
    if (revision !== expectedRevision) throw new Error("笔记已被更新，请先重新加载")
    const title = input.title.trim() || "未命名笔记"
    saved = {
      ...existing,
      title,
      markdown: input.markdown,
      plainText: toPlainText(input.markdown),
      revision: revision + 1,
      updatedAt: now,
    }
    await db.notes.put(saved)
    await db.knowledgeNodes.put({ ...node, title, updatedAt: now })
  })
  return saved
}

export async function moveNote(db: VeloDB, nodeId: string, parentId: string | null, inbox: boolean, now: number): Promise<void> {
  await db.transaction("rw", db.knowledgeNodes, async () => {
    const node = await requireLiveNode(db, nodeId)
    await verifyNoCycle(db, nodeId, parentId)
    await db.knowledgeNodes.put({
      ...node,
      parentId,
      inbox: parentId === null ? inbox : false,
      order: await nextOrder(db, parentId),
      updatedAt: now,
    })
  })
}

export async function trashNote(db: VeloDB, nodeId: string, now: number): Promise<void> {
  await db.transaction("rw", db.knowledgeNodes, async () => {
    const root = await requireLiveNode(db, nodeId)
    const liveNodes = (await db.knowledgeNodes.toArray()).filter((node) => !isDeleted(node))
    const descendants = collectSubtree(root, orderedChildren(liveNodes))
    await db.knowledgeNodes.bulkPut(descendants.map((node) => ({ ...node, deletedAt: now, trashRootId: root.id, updatedAt: now })))
  })
}

export async function restoreNote(db: VeloDB, nodeId: string, now: number): Promise<void> {
  await db.transaction("rw", db.knowledgeNodes, async () => {
    const selected = await db.knowledgeNodes.get(nodeId)
    if (!selected) throw new Error("笔记不存在")
    if (!isDeleted(selected)) throw new Error("笔记不在回收站")
    const trashRootId = selected.trashRootId ?? selected.id
    const group = (await db.knowledgeNodes.toArray()).filter((node) => node.trashRootId === trashRootId)
    const root = group.find((node) => node.id === trashRootId) ?? selected
    const parent = root.parentId === null ? undefined : await db.knowledgeNodes.get(root.parentId)
    const shouldReturnToInbox = root.parentId !== null && (parent === undefined || isDeleted(parent))
    const restoredRoot = {
      ...root,
      parentId: shouldReturnToInbox ? null : root.parentId,
      inbox: shouldReturnToInbox ? true : root.inbox,
      deletedAt: undefined,
      trashRootId: undefined,
      updatedAt: now,
    }
    await db.knowledgeNodes.put(restoredRoot)
    await db.knowledgeNodes.bulkPut(group
      .filter((node) => node.id !== root.id)
      .map((node) => ({ ...node, deletedAt: undefined, trashRootId: undefined, updatedAt: now })))
  })
}

function safeFilename(title: string) {
  const cleaned = title.replace(/\s*[\\/:*?"<>|]+\s*/g, "-").replace(/\s+/g, " ").trim().replace(/^-+|-+$/g, "")
  return `${cleaned || "笔记"}.md`
}

export async function exportMarkdown(db: VeloDB, nodeId: string): Promise<{ filename: string; text: string }> {
  const root = await requireLiveNode(db, nodeId)
  const liveNodes = (await db.knowledgeNodes.toArray()).filter((node) => !isDeleted(node))
  const subtree = collectSubtree(root, orderedChildren(liveNodes))
  const documents = new Map((await db.notes.toArray()).map((document) => [document.nodeId, document]))
  const levels = new Map<string, number>([[root.id, 1]])
  const children = orderedChildren(liveNodes)
  const lines: string[] = []
  for (const node of subtree) {
    const level = levels.get(node.id) ?? 1
    const markdown = readableMarkdown(documents.get(node.id))
    if (level <= 6) {
      lines.push(`${"#".repeat(level)} ${node.title}`, "", markdown, "")
    } else {
      const indent = "  ".repeat(level - 7)
      lines.push(`${indent}- **${node.title}**`)
      if (markdown) lines.push("", ...markdown.split("\n").map((line) => `${indent}  ${line}`))
      lines.push("")
    }
    for (const child of children.get(node.id) ?? []) levels.set(child.id, level + 1)
  }
  return { filename: safeFilename(root.title), text: `${lines.join("\n").replace(/\n+$/, "")}\n` }
}
