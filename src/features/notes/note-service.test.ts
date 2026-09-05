import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { VeloDB } from '../../db/velo-db'
import {
  createNote,
  exportMarkdown,
  loadNote,
  moveNote,
  restoreNote,
  saveNote,
  trashNote,
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
  test('creates root and inbox notes with a markdown document', async () => {
    const db = createDb()
    const root = await createNote(db, { title: '数学', parentId: null, inbox: false }, 1)
    const inbox = await createNote(db, { title: '收集', parentId: null, inbox: true }, 2)

    expect(root).toMatchObject({ title: '数学', parentId: null, inbox: false })
    expect(inbox).toMatchObject({ title: '收集', parentId: null, inbox: true })
    await expect(loadNote(db, root.id)).resolves.toMatchObject({ nodeId: root.id, title: '数学', markdown: '' })
  })

  test('rejects moving a node into its own descendant', async () => {
    const db = createDb()
    const parent = await createNote(db, { title: '数学', parentId: null, inbox: false }, 1)
    const child = await createNote(db, { title: '导数', parentId: parent.id, inbox: false }, 2)

    await expect(moveNote(db, parent.id, child.id, false, 3)).rejects.toThrow('不能移动')
  })

  test('rejects a corrupted parent cycle instead of traversing forever', async () => {
    const db = createDb()
    const note = await createNote(db, { title: '正常笔记', parentId: null, inbox: false }, 1)
    await db.knowledgeNodes.bulkAdd([
      { id: 'cycle-a', parentId: 'cycle-b', type: 'folder', title: '循环 A', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'cycle-b', parentId: 'cycle-a', type: 'folder', title: '循环 B', order: 0, createdAt: 1, updatedAt: 1 },
    ])

    await expect(moveNote(db, note.id, 'cycle-a', false, 2)).rejects.toThrow('目录结构存在循环')
  })

  test('keeps the same node and markdown when moving', async () => {
    const db = createDb()
    const source = await createNote(db, { title: '数学', parentId: null, inbox: false }, 1)
    const target = await createNote(db, { title: '物理', parentId: null, inbox: false }, 2)
    const note = await createNote(db, { title: '导数', parentId: source.id, inbox: false }, 3)
    const document = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: '导数', markdown: '# 定义\n变化率' }, document.revision ?? 0, 4)

    await moveNote(db, note.id, target.id, false, 5)

    await expect(loadNote(db, note.id)).resolves.toMatchObject({ nodeId: note.id, markdown: '# 定义\n变化率' })
    await expect(db.knowledgeNodes.get(note.id)).resolves.toMatchObject({ id: note.id, parentId: target.id })
  })

  test('rejects stale saves and keeps node and document titles synchronized', async () => {
    const db = createDb()
    const note = await createNote(db, { title: '导数', parentId: null, inbox: false }, 1)
    const document = await loadNote(db, note.id)

    await expect(saveNote(db, note.id, { title: '极限', markdown: '# 定义' }, document.revision ?? 0, 2))
      .resolves.toMatchObject({ title: '极限', markdown: '# 定义', revision: 1 })
    await expect(saveNote(db, note.id, { title: '旧稿', markdown: '旧' }, document.revision ?? 0, 3)).rejects.toThrow('已被更新')
    await expect(db.knowledgeNodes.get(note.id)).resolves.toMatchObject({ title: '极限' })
  })

  test('trashes a live subtree without reviving an already trashed descendant', async () => {
    const db = createDb()
    const parent = await createNote(db, { title: '数学', parentId: null, inbox: false }, 1)
    const child = await createNote(db, { title: '导数', parentId: parent.id, inbox: false }, 2)
    const grandchild = await createNote(db, { title: '极限', parentId: child.id, inbox: false }, 3)
    await trashNote(db, child.id, 4)
    const firstTrash = await db.knowledgeNodes.get(child.id)
    await trashNote(db, parent.id, 5)

    expect((await db.knowledgeNodes.get(parent.id))?.trashRootId).toBe(parent.id)
    expect((await db.knowledgeNodes.get(child.id))?.trashRootId).toBe(child.id)
    expect((await db.knowledgeNodes.get(grandchild.id))?.trashRootId).toBe(child.id)
    expect(firstTrash?.deletedAt).toBe(4)
  })

  test('restores only its trash group and sends a deleted parent restore to inbox', async () => {
    const db = createDb()
    const parent = await createNote(db, { title: '数学', parentId: null, inbox: false }, 1)
    const child = await createNote(db, { title: '导数', parentId: parent.id, inbox: false }, 2)
    const grandchild = await createNote(db, { title: '极限', parentId: child.id, inbox: false }, 3)
    await trashNote(db, child.id, 4)
    await trashNote(db, parent.id, 5)

    await restoreNote(db, child.id, 6)

    expect(await db.knowledgeNodes.get(child.id)).toMatchObject({ deletedAt: undefined, trashRootId: undefined, inbox: true, parentId: null })
    expect(await db.knowledgeNodes.get(grandchild.id)).toMatchObject({ deletedAt: undefined, trashRootId: undefined, parentId: child.id })
    expect((await db.knowledgeNodes.get(parent.id))?.deletedAt).toBe(5)
  })

  test('throws readable errors for missing nodes', async () => {
    const db = createDb()

    await expect(loadNote(db, 'missing')).rejects.toThrow('笔记不存在')
    await expect(trashNote(db, 'missing', 1)).rejects.toThrow('笔记不存在')
  })

  test('exports an ordered markdown subtree including each node text', async () => {
    const db = createDb()
    const parent = await createNote(db, { title: '数学 / 基础', parentId: null, inbox: false }, 1)
    const child = await createNote(db, { title: '导数', parentId: parent.id, inbox: false }, 2)
    let document = await loadNote(db, parent.id)
    await saveNote(db, parent.id, { title: parent.title, markdown: '根正文' }, document.revision ?? 0, 3)
    document = await loadNote(db, child.id)
    await saveNote(db, child.id, { title: child.title, markdown: '子正文' }, document.revision ?? 0, 4)

    await expect(exportMarkdown(db, parent.id)).resolves.toEqual({
      filename: '数学-基础.md',
      text: '# 数学 / 基础\n\n根正文\n\n## 导数\n\n子正文\n',
    })
  })
})
