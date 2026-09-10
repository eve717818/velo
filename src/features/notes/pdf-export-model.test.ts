import "fake-indexeddb/auto"
import { afterEach, describe, expect, test } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { createFolder, createNote, loadNote, saveNote, trashNode } from "./note-service"
import { buildPdfExportSnapshot } from "./pdf-export-model"

const databases: VeloDB[] = []

function createDb() {
  const db = new VeloDB(`pdf-export-model-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    db.close()
    await db.delete()
  }))
})

describe("buildPdfExportSnapshot", () => {
  test("freezes a selected folder and every live descendant in visible tree order", async () => {
    const db = createDb()
    const mathematics = await createFolder(db, { title: "数学", parentId: null }, 1)
    const secondChapter = await createFolder(db, { title: "第二章", parentId: mathematics.id }, 2)
    const firstChapter = await createFolder(db, { title: "第一章", parentId: mathematics.id }, 3)
    await db.knowledgeNodes.update(firstChapter.id, { order: 0 })
    await db.knowledgeNodes.update(secondChapter.id, { order: 1 })
    const derivative = await createNote(db, { title: "导数", parentId: firstChapter.id }, 4)
    const integral = await createNote(db, { title: "积分", parentId: secondChapter.id }, 5)
    const derivativeDocument = await loadNote(db, derivative.id)
    const integralDocument = await loadNote(db, integral.id)
    await saveNote(db, derivative.id, { title: derivative.title, markdown: "变化率" }, derivativeDocument.revision ?? 0, 6)
    await saveNote(db, integral.id, { title: integral.title, markdown: "面积" }, integralDocument.revision ?? 0, 7)

    await expect(buildPdfExportSnapshot(db, mathematics.id)).resolves.toEqual({
      title: "数学",
      filename: "数学.pdf",
      hasNotes: true,
      entries: [
        { id: mathematics.id, kind: "folder", title: "数学", level: 0 },
        { id: firstChapter.id, kind: "folder", title: "第一章", level: 1 },
        { id: derivative.id, kind: "note", title: "导数", level: 2, markdown: "变化率" },
        { id: secondChapter.id, kind: "folder", title: "第二章", level: 1 },
        { id: integral.id, kind: "note", title: "积分", level: 2, markdown: "面积" },
      ],
    })
  })

  test("exports every live root from the notebook root and excludes deleted subtrees", async () => {
    const db = createDb()
    const mathematics = await createFolder(db, { title: "数学", parentId: null }, 1)
    const physics = await createFolder(db, { title: "物理", parentId: null }, 2)
    const liveNote = await createNote(db, { title: "力学", parentId: physics.id }, 3)
    const deletedNote = await createNote(db, { title: "旧草稿", parentId: mathematics.id }, 4)
    await trashNode(db, deletedNote.id, 5)

    const snapshot = await buildPdfExportSnapshot(db, null)

    expect(snapshot).toMatchObject({ title: "笔记库", filename: "笔记库.pdf", hasNotes: true })
    expect(snapshot.entries).toEqual([
      { id: mathematics.id, kind: "folder", title: "数学", level: 0 },
      { id: physics.id, kind: "folder", title: "物理", level: 0 },
      { id: liveNote.id, kind: "note", title: "力学", level: 1, markdown: "" },
    ])
  })

  test("exports only a selected note and sanitizes the PDF filename", async () => {
    const db = createDb()
    const note = await createNote(db, { title: "线性代数 / 矩阵", parentId: null }, 1)

    await expect(buildPdfExportSnapshot(db, note.id)).resolves.toEqual({
      title: "线性代数 / 矩阵",
      filename: "线性代数-矩阵.pdf",
      hasNotes: true,
      entries: [{ id: note.id, kind: "note", title: "线性代数 / 矩阵", level: 0, markdown: "" }],
    })
  })

  test("keeps empty folders in the hierarchy but reports that there is nothing to export", async () => {
    const db = createDb()
    const folder = await createFolder(db, { title: "待整理", parentId: null }, 1)
    const child = await createFolder(db, { title: "空章节", parentId: folder.id }, 2)

    await expect(buildPdfExportSnapshot(db, folder.id)).resolves.toEqual({
      title: "待整理",
      filename: "待整理.pdf",
      hasNotes: false,
      entries: [
        { id: folder.id, kind: "folder", title: "待整理", level: 0 },
        { id: child.id, kind: "folder", title: "空章节", level: 1 },
      ],
    })
  })

  test("rejects missing or deleted selections", async () => {
    const db = createDb()
    const note = await createNote(db, { title: "已删除", parentId: null }, 1)
    await trashNode(db, note.id, 2)

    await expect(buildPdfExportSnapshot(db, "missing")).rejects.toThrow("导出范围不存在")
    await expect(buildPdfExportSnapshot(db, note.id)).rejects.toThrow("导出范围不存在")
  })
})
