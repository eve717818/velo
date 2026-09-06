import { describe, expect, it } from "vitest"
import type { KnowledgeNode, LegacyKnowledgeNode, NoteDocument } from "@/db/types"
import { isDocumentEmpty, migrateLegacyKnowledgeTree, validateKnowledgeTree } from "./knowledge-tree-model"

const node = (id: string, parentId: string | null, title: string, order: number): LegacyKnowledgeNode => ({
  id,
  parentId,
  type: "note",
  title,
  order,
  inbox: id === "inbox",
  createdAt: order + 1,
  updatedAt: order + 1,
})

const document = (id: string, nodeId: string, markdown: string): NoteDocument => ({
  id,
  nodeId,
  title: nodeId,
  content: { type: "doc" },
  plainText: markdown,
  markdown,
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
})

describe("isDocumentEmpty", () => {
  it("treats absent and structurally empty documents as empty", () => {
    expect(isDocumentEmpty(undefined)).toBe(true)
    expect(isDocumentEmpty({ ...document("empty", "node", "  \n"), content: {} })).toBe(true)
    expect(isDocumentEmpty({ ...document("empty", "node", ""), content: { type: "doc", content: [] } })).toBe(true)
    expect(isDocumentEmpty({
      ...document("empty", "node", ""),
      content: { type: "doc", content: [{ type: "paragraph", text: " \n" }] },
    })).toBe(true)
  })

  it("detects text and meaningful scalar values nested in structured content", () => {
    expect(isDocumentEmpty({
      ...document("text", "node", ""),
      content: { type: "doc", content: [{ type: "paragraph", text: "结构化正文" }] },
    })).toBe(false)
    expect(isDocumentEmpty({
      ...document("custom", "node", ""),
      content: { type: "custom", payload: { count: 0 } },
    })).toBe(false)
  })
})

describe("migrateLegacyKnowledgeTree", () => {
  it("keeps a leaf as a note and removes its inbox marker", () => {
    const inputNode = node("inbox", null, "速记", 0)
    const inputDocument = document("doc", "inbox", "正文")

    const result = migrateLegacyKnowledgeTree([inputNode], [inputDocument])

    expect(result.nodes).toEqual([expect.objectContaining({ id: "inbox", parentId: null, type: "note" })])
    expect(result.nodes[0]).not.toHaveProperty("inbox")
    expect(result.documents[0]).toMatchObject({ id: "doc", nodeId: "inbox", markdown: "正文" })
    expect(result.nodes[0]).not.toBe(inputNode)
    expect(result.documents[0]).not.toBe(inputDocument)
    expect(inputNode).toHaveProperty("inbox")
  })

  it("turns an empty parent into a folder and removes its empty document", () => {
    const result = migrateLegacyKnowledgeTree(
      [node("parent", null, "数学", 0), node("child", "parent", "导数", 0)],
      [document("parent-doc", "parent", ""), document("child-doc", "child", "定义")],
    )

    expect(result.nodes.find((item) => item.id === "parent")).toMatchObject({ type: "folder" })
    expect(result.documents.find((item) => item.id === "parent-doc")).toBeUndefined()
  })

  it("moves a non-empty parent document to a deterministic overview note", () => {
    const result = migrateLegacyKnowledgeTree(
      [node("parent", null, "物理", 0), node("child", "parent", "力学", 0)],
      [document("parent-doc", "parent", "课程概览"), document("child-doc", "child", "牛顿定律")],
    )

    const overview = result.nodes.find((item) => item.parentId === "parent" && item.title === "概览")
    expect(overview).toMatchObject({ id: "parent--overview", type: "note", order: 0 })
    expect(result.documents.find((item) => item.id === "parent-doc")).toMatchObject({ nodeId: overview?.id, markdown: "课程概览" })
    expect(result.nodes.find((item) => item.id === "child")?.order).toBe(1)
  })

  it("adds numeric suffixes when deterministic overview and document IDs collide", () => {
    const result = migrateLegacyKnowledgeTree(
      [
        node("parent", null, "物理", 0),
        node("parent--overview", "parent", "已有笔记", 0),
        node("leaf", null, "无正文笔记", 1),
        node("holder", null, "占位笔记", 2),
      ],
      [
        document("parent-doc", "parent", "课程概览"),
        document("existing-overview-doc", "parent--overview", "已有正文"),
        document("leaf--document", "holder", "占用确定性 ID"),
      ],
    )

    expect(result.nodes.find((item) => item.id === "parent--overview-2")).toMatchObject({ parentId: "parent", title: "概览", order: 0 })
    expect(result.documents.find((item) => item.nodeId === "leaf")).toMatchObject({ id: "leaf--document-2", markdown: "" })
  })

  it("creates exactly one deterministic empty document for a leaf without one", () => {
    const result = migrateLegacyKnowledgeTree([node("leaf", null, "待补充", 0)], [])

    expect(result.nodes).toEqual([expect.objectContaining({ id: "leaf", type: "note" })])
    expect(result.documents).toEqual([
      expect.objectContaining({
        id: "leaf--document",
        nodeId: "leaf",
        title: "待补充",
        content: { type: "doc" },
        plainText: "",
        markdown: "",
        revision: 0,
      }),
    ])
  })

  it("aborts rather than discarding ambiguous or orphaned legacy rows", () => {
    expect(() => migrateLegacyKnowledgeTree(
      [node("leaf", null, "重复正文", 0)],
      [document("first", "leaf", "一"), document("second", "leaf", "二")],
    )).toThrow()
    expect(() => migrateLegacyKnowledgeTree(
      [node("leaf", null, "正文孤儿", 0)],
      [document("orphan", "missing", "孤儿")],
    )).toThrow()
    expect(() => migrateLegacyKnowledgeTree(
      [node("child", "missing", "父节点缺失", 0)],
      [document("child-doc", "child", "正文")],
    )).toThrow()
  })
})

describe("validateKnowledgeTree", () => {
  const currentNode = (id: string, parentId: string | null, type: KnowledgeNode["type"]): KnowledgeNode => ({
    ...node(id, parentId, id, 0),
    type,
  })

  it("rejects folders with documents", () => {
    expect(() => validateKnowledgeTree(
      [currentNode("folder", null, "folder")],
      [document("bad", "folder", "不应存在")],
    )).toThrow("文件夹不能包含正文")
  })

  it("rejects notes with children", () => {
    expect(() => validateKnowledgeTree(
      [currentNode("note", null, "note"), currentNode("child", "note", "note")],
      [document("note-doc", "note", "正文"), document("child-doc", "child", "正文")],
    )).toThrow("笔记不能包含子节点")
  })

  it("rejects notes without exactly one document", () => {
    expect(() => validateKnowledgeTree([currentNode("note", null, "note")], [])).toThrow("笔记正文关联异常")
  })

  it("rejects parent references that do not point to folders", () => {
    expect(() => validateKnowledgeTree(
      [currentNode("parent", null, "note"), currentNode("child", "parent", "note")],
      [document("parent-doc", "parent", "正文"), document("child-doc", "child", "正文")],
    )).toThrow("笔记不能包含子节点")

    expect(() => validateKnowledgeTree(
      [currentNode("child", "missing", "note")],
      [document("child-doc", "child", "正文")],
    )).toThrow("父节点必须是文件夹")
  })

  it("rejects cyclic parents", () => {
    expect(() => validateKnowledgeTree(
      [currentNode("first", "second", "folder"), currentNode("second", "first", "folder")],
      [],
    )).toThrow("目录结构存在循环")
  })
})
