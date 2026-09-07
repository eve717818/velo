import type { KnowledgeNode, KnowledgeNodeType, NoteDocument } from '@/db/types'
import type { VeloDB } from '@/db/velo-db'
import { createId } from '@/lib/create-id'

type CreateNodeInput = {
  title: string
  parentId: string | null
}

type SaveNoteInput = {
  title: string
  markdown: string
}

function isDeleted(node: KnowledgeNode) {
  return node.deletedAt !== undefined
}

function readableMarkdown(document: NoteDocument | undefined) {
  if (!document) return ''
  return typeof document.markdown === 'string' ? document.markdown : document.plainText
}

function toPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/^[\s>#*-]+/gm, '')
    .replace(/[#*_`]/g, '')
    .trim()
}

async function requireLiveNode(db: VeloDB, nodeId: string) {
  const node = await db.knowledgeNodes.get(nodeId)
  if (!node) throw new Error('笔记不存在')
  if (isDeleted(node)) throw new Error('笔记已在回收站')
  return node
}

async function requireLiveFolder(db: VeloDB, parentId: string | null) {
  if (parentId === null) return null
  const parent = await db.knowledgeNodes.get(parentId)
  if (!parent || isDeleted(parent)) throw new Error('目标文件夹不存在或已删除')
  if (parent.type !== 'folder') throw new Error('父节点必须是文件夹')
  return parent
}

async function requireLiveNote(db: VeloDB, nodeId: string) {
  const node = await requireLiveNode(db, nodeId)
  if (node.type !== 'note') throw new Error('请选择一篇笔记')
  return node
}

async function nextOrder(db: VeloDB, parentId: string | null) {
  const siblings = (await db.knowledgeNodes.toArray()).filter((node) => node.parentId === parentId && !isDeleted(node))
  return siblings.reduce((maximum, sibling) => Math.max(maximum, sibling.order), -1) + 1
}

async function ensureDocument(db: VeloDB, node: KnowledgeNode, now: number) {
  const existing = await db.notes.where('nodeId').equals(node.id).first()
  if (existing) return existing
  const document: NoteDocument = {
    id: createId(),
    nodeId: node.id,
    title: node.title,
    content: {},
    plainText: '',
    markdown: '',
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
    if (cursor === nodeId) throw new Error('不能移动到自身或子节点')
    if (seen.has(cursor)) throw new Error('目录结构存在循环，无法移动')
    seen.add(cursor)
    const parent = await db.knowledgeNodes.get(cursor)
    if (!parent || isDeleted(parent)) throw new Error('目标文件夹不存在或已删除')
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

async function createNode(db: VeloDB, type: KnowledgeNodeType, input: CreateNodeInput, now: number) {
  let created!: KnowledgeNode
  await db.transaction('rw', db.knowledgeNodes, db.notes, async () => {
    await requireLiveFolder(db, input.parentId)
    const title = input.title.trim() || (type === 'folder' ? '未命名文件夹' : '未命名笔记')
    created = {
      id: createId(),
      parentId: input.parentId,
      type,
      title,
      order: await nextOrder(db, input.parentId),
      createdAt: now,
      updatedAt: now,
    }
    await db.knowledgeNodes.add(created)
    if (type === 'note') await ensureDocument(db, created, now)
  })
  return created
}

export function createFolder(db: VeloDB, input: CreateNodeInput, now: number): Promise<KnowledgeNode> {
  return createNode(db, 'folder', input, now)
}

export function createNote(db: VeloDB, input: CreateNodeInput, now: number): Promise<KnowledgeNode> {
  return createNode(db, 'note', input, now)
}

export async function loadNote(db: VeloDB, nodeId: string): Promise<NoteDocument> {
  let document!: NoteDocument
  await db.transaction('rw', db.knowledgeNodes, db.notes, async () => {
    const node = await requireLiveNote(db, nodeId)
    document = await ensureDocument(db, node, node.updatedAt)
  })
  return document
}

export async function saveNote(db: VeloDB, nodeId: string, input: SaveNoteInput, expectedRevision: number, now: number): Promise<NoteDocument> {
  let saved!: NoteDocument
  await db.transaction('rw', db.knowledgeNodes, db.notes, async () => {
    const node = await requireLiveNote(db, nodeId)
    const existing = await ensureDocument(db, node, now)
    const revision = existing.revision ?? 0
    if (revision !== expectedRevision) throw new Error('笔记已被更新，请先重新加载')
    const title = input.title.trim() || '未命名笔记'
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

export async function renameNode(db: VeloDB, nodeId: string, title: string, now: number): Promise<KnowledgeNode> {
  let renamed!: KnowledgeNode
  await db.transaction('rw', db.knowledgeNodes, db.notes, async () => {
    const node = await requireLiveNode(db, nodeId)
    renamed = {
      ...node,
      title: title.trim() || (node.type === 'folder' ? '未命名文件夹' : '未命名笔记'),
      updatedAt: now,
    }
    await db.knowledgeNodes.put(renamed)
    if (node.type === 'note') {
      const document = await db.notes.where('nodeId').equals(node.id).first()
      if (document) {
        await db.notes.put({
          ...document,
          title: renamed.title,
          revision: (document.revision ?? 0) + 1,
          updatedAt: now,
        })
      }
    }
  })
  return renamed
}

export async function moveNode(db: VeloDB, nodeId: string, parentId: string | null, now: number): Promise<void> {
  await db.transaction('rw', db.knowledgeNodes, async () => {
    const node = await requireLiveNode(db, nodeId)
    await requireLiveFolder(db, parentId)
    await verifyNoCycle(db, nodeId, parentId)
    await db.knowledgeNodes.put({
      ...node,
      parentId,
      order: await nextOrder(db, parentId),
      updatedAt: now,
    })
  })
}

export async function trashNode(db: VeloDB, nodeId: string, now: number): Promise<void> {
  await db.transaction('rw', db.knowledgeNodes, async () => {
    const root = await requireLiveNode(db, nodeId)
    const liveNodes = (await db.knowledgeNodes.toArray()).filter((node) => !isDeleted(node))
    const descendants = collectSubtree(root, orderedChildren(liveNodes))
    await db.knowledgeNodes.bulkPut(descendants.map((node) => ({ ...node, deletedAt: now, trashRootId: root.id, updatedAt: now })))
  })
}

export async function restoreNode(db: VeloDB, nodeId: string, now: number): Promise<void> {
  await db.transaction('rw', db.knowledgeNodes, async () => {
    const selected = await db.knowledgeNodes.get(nodeId)
    if (!selected) throw new Error('笔记不存在')
    if (!isDeleted(selected)) throw new Error('笔记不在回收站')
    const trashRootId = selected.trashRootId ?? selected.id
    const group = (await db.knowledgeNodes.toArray()).filter((node) => node.trashRootId === trashRootId)
    const root = group.find((node) => node.id === trashRootId) ?? selected
    const formerParent = root.parentId === null ? null : await db.knowledgeNodes.get(root.parentId)
    const restoreToRoot = root.parentId !== null
      && (!formerParent || isDeleted(formerParent) || formerParent.type !== 'folder')
    const restoredRoot: KnowledgeNode = {
      ...root,
      parentId: restoreToRoot ? null : root.parentId,
      order: restoreToRoot ? await nextOrder(db, null) : root.order,
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
  const cleaned = title.replace(/\s*[\\/:*?"<>|]+\s*/g, '-').replace(/\s+/g, ' ').trim().replace(/^-+|-+$/g, '')
  return `${cleaned || '笔记'}.md`
}

export async function exportMarkdown(db: VeloDB, nodeId: string): Promise<{ filename: string; text: string }> {
  const root = await requireLiveNote(db, nodeId)
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
      lines.push(`${'#'.repeat(level)} ${node.title}`, '', markdown, '')
    } else {
      const indent = '  '.repeat(level - 7)
      lines.push(`${indent}- **${node.title}**`)
      if (markdown) lines.push('', ...markdown.split('\n').map((line) => `${indent}  ${line}`))
      lines.push('')
    }
    for (const child of children.get(node.id) ?? []) levels.set(child.id, level + 1)
  }
  return { filename: safeFilename(root.title), text: `${lines.join('\n').replace(/\n+$/, '')}\n` }
}
