import "fake-indexeddb/auto"
import { afterEach, describe, expect, test } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { createFolder, createNote, loadNote, saveNote, trashNode } from "./note-service"
import { searchKnowledgeTree } from "./knowledge-search"

const databases: VeloDB[] = []

function createDb() {
  const db = new VeloDB(`knowledge-search-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    db.close()
    await db.delete()
  }))
})

describe("searchKnowledgeTree", () => {
  test("matches folders, note titles and note bodies with full paths", async () => {
    const db = createDb()
    const subject = await createFolder(db, { title: "大学数学", parentId: null }, 1)
    const chapter = await createFolder(db, { title: "第一章", parentId: subject.id }, 2)
    const note = await createNote(db, { title: "导数", parentId: chapter.id }, 3)
    const document = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: note.title, markdown: "函数的变化率与切线斜率。" }, document.revision ?? 0, 4)

    await expect(searchKnowledgeTree(db, "大学数学")).resolves.toEqual([
      { id: subject.id, type: "folder", title: "大学数学", path: "笔记库 / 大学数学", snippet: "" },
    ])
    await expect(searchKnowledgeTree(db, "导数")).resolves.toEqual([
      { id: note.id, type: "note", title: "导数", path: "笔记库 / 大学数学 / 第一章 / 导数", snippet: "" },
    ])
    await expect(searchKnowledgeTree(db, "变化率")).resolves.toEqual([
      { id: note.id, type: "note", title: "导数", path: "笔记库 / 大学数学 / 第一章 / 导数", snippet: "函数的变化率与切线斜率。" },
    ])
  })

  test("is case-insensitive, excludes deleted notes and returns no results for blank input", async () => {
    const db = createDb()
    const live = await createNote(db, { title: "Chapter Notes", parentId: null }, 1)
    const deleted = await createNote(db, { title: "Chapter Archive", parentId: null }, 2)
    await trashNode(db, deleted.id, 3)

    expect(await searchKnowledgeTree(db, "chapter")).toEqual([
      { id: live.id, type: "note", title: "Chapter Notes", path: "笔记库 / Chapter Notes", snippet: "" },
    ])
    expect(await searchKnowledgeTree(db, "   ")).toEqual([])
  })
})
