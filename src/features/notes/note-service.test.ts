import 'fake-indexeddb/auto'
import { afterEach, describe, expect, expectTypeOf, test } from 'vitest'
import { VeloDB } from '../../db/velo-db'
import {
  createFolder,
  createNote,
  exportMarkdown,
  loadNote,
  moveNode,
  renameNode,
  restoreNode,
  saveNote,
  trashNode,
} from './note-service'

const databases: VeloDB[] = []

function createDb() {
  const db = new VeloDB(`note-service-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    db.close()
    await db.delete()
  }))
})

describe('note service', () => {
  test('uses the same node input for folders and notes', () => {
    type FolderInput = Parameters<typeof createFolder>[1]
    type NoteInput = Parameters<typeof createNote>[1]

    expectTypeOf<FolderInput>().toEqualTypeOf<{ title: string; parentId: string | null }>()
    expectTypeOf<NoteInput>().toEqualTypeOf<{ title: string; parentId: string | null }>()
  })

  test('creates folders without documents and notes with one document', async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: '数学', parentId: null }, 1)
    const note = await createNote(db, { title: '导数', parentId: folder.id }, 2)

    expect(folder).toMatchObject({ type: 'folder', parentId: null })
    expect(folder).not.toHaveProperty('inbox')
    expect(await db.notes.where('nodeId').equals(folder.id).count()).toBe(0)
    expect(note).toMatchObject({ type: 'note', parentId: folder.id })
    expect(note).not.toHaveProperty('inbox')
    expect(await db.notes.where('nodeId').equals(note.id).count()).toBe(1)
  })

  test('rejects children or moves under a note', async () => {
    const db = createDb()
    const note = await createNote(db, { title: '孤立笔记', parentId: null }, 1)

    await expect(createFolder(db, { title: '错误目录', parentId: note.id }, 2)).rejects.toThrow('父节点必须是文件夹')
    const other = await createNote(db, { title: '另一篇', parentId: null }, 3)
    await expect(moveNode(db, other.id, note.id, 4)).rejects.toThrow('父节点必须是文件夹')
  })

  test('restores a subtree to root when its former folder is gone', async () => {
    const db = createDb()
    const existingRoot = await createFolder(db, { title: '现有根目录', parentId: null }, 1)
    const outer = await createFolder(db, { title: '外层', parentId: null }, 2)
    const inner = await createFolder(db, { title: '内层', parentId: outer.id }, 3)
    const note = await createNote(db, { title: '正文', parentId: inner.id }, 4)
    await trashNode(db, inner.id, 5)
    await db.knowledgeNodes.delete(outer.id)

    await restoreNode(db, note.id, 6)

    expect(await db.knowledgeNodes.get(inner.id)).toMatchObject({ parentId: null, order: existingRoot.order + 1, deletedAt: undefined })
    expect(await db.knowledgeNodes.get(note.id)).toMatchObject({ parentId: inner.id, deletedAt: undefined })
  })

  test('creates stable node and document IDs when randomUUID is unavailable on local HTTP', async () => {
    const db = new VeloDB('note-service-without-random-uuid')
    databases.push(db)
    const originalRandomUuid = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined })

    try {
      const note = await createNote(db, { title: '离线笔记', parentId: null }, 1)
      const document = await loadNote(db, note.id)
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      expect(note.id).toMatch(uuid)
      expect(document.id).toMatch(uuid)
    } finally {
      if (originalRandomUuid) Object.defineProperty(crypto, 'randomUUID', originalRandomUuid)
      else delete (crypto as { randomUUID?: () => string }).randomUUID
    }
  })

  test('renames folders without creating or modifying documents', async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: '旧目录', parentId: null }, 1)
    const unexpectedDocument = {
      id: 'unexpected-folder-document',
      nodeId: folder.id,
      title: '意外旧文档',
      content: {},
      plainText: '',
      markdown: '',
      revision: 4,
      createdAt: 1,
      updatedAt: 1,
    }
    await db.notes.add(unexpectedDocument)

    await expect(renameNode(db, folder.id, '  新目录  ', 3)).resolves.toMatchObject({ title: '新目录', updatedAt: 3 })
    await expect(db.notes.get(unexpectedDocument.id)).resolves.toEqual(unexpectedDocument)
  })

  test('increments note revision on rename so stale autosaves cannot overwrite the title', async () => {
    const db = createDb()
    const note = await createNote(db, { title: '旧笔记', parentId: null }, 1)
    const staleDocument = await loadNote(db, note.id)

    await expect(renameNode(db, note.id, '新笔记', 2)).resolves.toMatchObject({ title: '新笔记', updatedAt: 2 })

    await expect(loadNote(db, note.id)).resolves.toMatchObject({
      id: staleDocument.id,
      title: '新笔记',
      revision: (staleDocument.revision ?? 0) + 1,
      updatedAt: 2,
    })
    await expect(saveNote(db, note.id, { title: '旧笔记', markdown: '旧正文' }, staleDocument.revision ?? 0, 3))
      .rejects.toThrow('笔记已被更新')
    await expect(db.knowledgeNodes.get(note.id)).resolves.toMatchObject({ title: '新笔记', updatedAt: 2 })
  })

  test('rejects moving a node into its own descendant', async () => {
    const db = createDb()
    const parent = await createFolder(db, { title: '数学', parentId: null }, 1)
    const child = await createFolder(db, { title: '导数', parentId: parent.id }, 2)

    await expect(moveNode(db, parent.id, child.id, 3)).rejects.toThrow('不能移动')
  })

  test('rejects a corrupted parent cycle instead of traversing forever', async () => {
    const db = createDb()
    const note = await createNote(db, { title: '正常笔记', parentId: null }, 1)
    await db.knowledgeNodes.bulkAdd([
      { id: 'cycle-a', parentId: 'cycle-b', type: 'folder', title: '循环 A', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'cycle-b', parentId: 'cycle-a', type: 'folder', title: '循环 B', order: 0, createdAt: 1, updatedAt: 1 },
    ])

    await expect(moveNode(db, note.id, 'cycle-a', 2)).rejects.toThrow('目录结构存在循环')
  })

  test('keeps the same node and markdown when moving between folders', async () => {
    const db = createDb()
    const source = await createFolder(db, { title: '数学', parentId: null }, 1)
    const target = await createFolder(db, { title: '物理', parentId: null }, 2)
    const note = await createNote(db, { title: '导数', parentId: source.id }, 3)
    const document = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: '导数', markdown: '# 定义\n变化率' }, document.revision ?? 0, 4)

    await moveNode(db, note.id, target.id, 5)

    await expect(loadNote(db, note.id)).resolves.toMatchObject({ id: document.id, nodeId: note.id, markdown: '# 定义\n变化率' })
    await expect(db.knowledgeNodes.get(note.id)).resolves.toMatchObject({ id: note.id, parentId: target.id })
  })

  test('rejects stale saves and keeps IME-independent save revisions synchronized', async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: '数学', parentId: null }, 1)
    const note = await createNote(db, { title: '导数', parentId: folder.id }, 2)
    const document = await loadNote(db, note.id)

    await expect(saveNote(db, note.id, { title: '极限', markdown: '# 定义' }, document.revision ?? 0, 3))
      .resolves.toMatchObject({ title: '极限', markdown: '# 定义', revision: 1 })
    await expect(saveNote(db, note.id, { title: '旧稿', markdown: '旧' }, document.revision ?? 0, 4)).rejects.toThrow('已被更新')
    await expect(db.knowledgeNodes.get(note.id)).resolves.toMatchObject({ title: '极限' })
  })

  test('rejects note-document operations for folders', async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: '资料', parentId: null }, 1)

    await expect(loadNote(db, folder.id)).rejects.toThrow('请选择一篇笔记')
    await expect(saveNote(db, folder.id, { title: '错误', markdown: '错误' }, 0, 2)).rejects.toThrow('请选择一篇笔记')
    await expect(exportMarkdown(db, folder.id)).rejects.toThrow('请选择一篇笔记')
    expect(await db.notes.where('nodeId').equals(folder.id).count()).toBe(0)
  })

  test('trashes a live subtree without changing an already trashed descendant group', async () => {
    const db = createDb()
    const parent = await createFolder(db, { title: '数学', parentId: null }, 1)
    const child = await createFolder(db, { title: '导数', parentId: parent.id }, 2)
    const grandchild = await createNote(db, { title: '极限', parentId: child.id }, 3)
    await trashNode(db, child.id, 4)
    const firstTrash = await db.knowledgeNodes.get(child.id)

    await trashNode(db, parent.id, 5)

    expect((await db.knowledgeNodes.get(parent.id))?.trashRootId).toBe(parent.id)
    expect((await db.knowledgeNodes.get(child.id))?.trashRootId).toBe(child.id)
    expect((await db.knowledgeNodes.get(grandchild.id))?.trashRootId).toBe(child.id)
    expect(firstTrash?.deletedAt).toBe(4)
  })

  test('restores the exact trash group from a clicked descendant', async () => {
    const db = createDb()
    const parent = await createFolder(db, { title: '数学', parentId: null }, 1)
    const child = await createFolder(db, { title: '导数', parentId: parent.id }, 2)
    const grandchild = await createNote(db, { title: '极限', parentId: child.id }, 3)
    await trashNode(db, child.id, 4)
    await trashNode(db, parent.id, 5)

    await restoreNode(db, grandchild.id, 6)

    expect(await db.knowledgeNodes.get(child.id)).toMatchObject({ deletedAt: undefined, trashRootId: undefined, parentId: null })
    expect(await db.knowledgeNodes.get(grandchild.id)).toMatchObject({ deletedAt: undefined, trashRootId: undefined, parentId: child.id })
    expect((await db.knowledgeNodes.get(parent.id))?.deletedAt).toBe(5)
  })

  test('throws readable errors for missing nodes', async () => {
    const db = createDb()

    await expect(loadNote(db, 'missing')).rejects.toThrow('笔记不存在')
    await expect(trashNode(db, 'missing', 1)).rejects.toThrow('笔记不存在')
  })

  test('exports the selected note heading and markdown in order', async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: '数学', parentId: null }, 1)
    const note = await createNote(db, { title: '数学 / 基础', parentId: folder.id }, 2)
    const document = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: note.title, markdown: '正文' }, document.revision ?? 0, 3)

    await expect(exportMarkdown(db, note.id)).resolves.toEqual({
      filename: '数学-基础.md',
      text: '# 数学 / 基础\n\n正文\n',
    })
  })
})
