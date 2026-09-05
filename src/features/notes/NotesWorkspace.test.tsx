import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { createNote, loadNote, saveNote } from "./note-service"
import { NotesWorkspace, type NoteServiceOverrides } from "./NotesWorkspace"

let db: VeloDB

function renderWorkspace(options?: { initialEntry?: string; services?: NoteServiceOverrides }) {
  return render(
    <MemoryRouter initialEntries={[options?.initialEntry ?? "/notes"]}>
      <NotesWorkspace db={db} services={options?.services} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  db = new VeloDB(`notes-workspace-${crypto.randomUUID()}`)
  localStorage.clear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await db.delete()
})

describe("NotesWorkspace", () => {
  it("keeps the compact phone header labels on one line", () => {
    renderWorkspace()

    expect(screen.getByRole("heading", { name: "笔记工作台" })).toHaveAttribute("data-nowrap", "true")
    expect(screen.getByRole("button", { name: "目录" }).querySelector("[data-nowrap='true']")).toHaveTextContent("目录")
    expect(screen.getByRole("button", { name: "新建笔记" }).querySelector("[data-nowrap='true']")).toHaveTextContent("新建笔记")
  })

  it("only offers split view at a sufficiently wide viewport and falls back when it narrows", async () => {
    const note = await createNote(db, { title: "响应式编辑", parentId: null, inbox: false }, 1)
    let matches = false
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches,
      media: "(min-width: 1051px)",
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    })))
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    await screen.findByLabelText("Markdown 正文")
    expect(screen.queryByRole("button", { name: "分栏" })).not.toBeInTheDocument()

    matches = true
    act(() => listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)))
    await userEvent.setup().click(await screen.findByRole("button", { name: "分栏" }))
    expect(await screen.findByLabelText("Markdown 阅读内容")).toBeInTheDocument()

    matches = false
    act(() => listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)))
    expect(screen.queryByRole("button", { name: "分栏" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Markdown 阅读内容")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Markdown 正文")).toBeInTheDocument()
  })
  it("creates an empty note, edits it and announces a successful autosave", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "新建笔记" }))
    const body = await screen.findByLabelText("Markdown 正文")
    await user.clear(screen.getByLabelText("笔记标题"))
    await user.type(screen.getByLabelText("笔记标题"), "高等数学")
    await user.type(body, "# 我的课堂笔记")

    expect(await screen.findByText("已保存")).toBeInTheDocument()
    expect((await db.notes.toArray()).some((note) => note.markdown?.includes("我的课堂笔记"))).toBe(true)
  })

  it("reads safe Markdown without rendering raw HTML or remote images", async () => {
    const note = await createNote(db, { title: "安全预览", parentId: null, inbox: false }, 1)
    const loadedDocument = await loadNote(db, note.id)
    await saveNote(
      db,
      note.id,
      { title: note.title, markdown: "## 标题\n<script>alert(1)</script>\n![远程](https://example.com/pixel.png)" },
      loadedDocument.revision ?? 0,
      2,
    )
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    await user.click(await screen.findByRole("button", { name: "阅读" }))

    expect(await screen.findByRole("heading", { name: "标题" })).toBeInTheDocument()
    expect(window.document.querySelector("script")).toBeNull()
    expect(window.document.querySelector('img[src^="http"]')).toBeNull()
  })

  it("flushes the current draft before switching to another note", async () => {
    const first = await createNote(db, { title: "第一篇", parentId: null, inbox: false }, 1)
    const second = await createNote(db, { title: "第二篇", parentId: null, inbox: false }, 2)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${first.id}` })

    const body = await screen.findByLabelText("Markdown 正文")
    await user.type(body, "切换前必须保存")
    await user.click(screen.getByRole("button", { name: "打开笔记：第二篇" }))

    expect(await screen.findByDisplayValue("第二篇")).toBeInTheDocument()
    expect((await loadNote(db, first.id)).markdown).toContain("切换前必须保存")
    expect(second.id).not.toBe(first.id)
  })

  it("retains a failed draft and exposes recovery actions", async () => {
    const note = await createNote(db, { title: "离线草稿", parentId: null, inbox: false }, 1)
    const rejectSave = vi.fn<typeof saveNote>().mockRejectedValue(new Error("模拟保存失败"))
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}`, services: { saveNote: rejectSave } })

    await user.type(await screen.findByLabelText("Markdown 正文"), "仍然留在这里")

    expect(await screen.findByText("保存失败，草稿仍在本机")).toBeInTheDocument()
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("仍然留在这里")
    expect(localStorage.getItem(`velow-note-draft:${note.id}`)).toContain("仍然留在这里")
    expect(screen.getByRole("button", { name: "重试保存" })).toBeInTheDocument()
  })

  it("does not save in the middle of Chinese IME composition", async () => {
    const note = await createNote(db, { title: "中文输入", parentId: null, inbox: false }, 1)
    const saveSpy = vi.fn<typeof saveNote>(saveNote)
    renderWorkspace({ initialEntry: `/notes?note=${note.id}`, services: { saveNote: saveSpy } })
    const body = await screen.findByLabelText("Markdown 正文")

    fireEvent.compositionStart(body)
    fireEvent.change(body, { target: { value: "拼音组合" } })
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(saveSpy).not.toHaveBeenCalled()

    fireEvent.compositionEnd(body)
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
  })

  it("serializes autosaves so a slow earlier save cannot conflict with the latest draft", async () => {
    const note = await createNote(db, { title: "慢速保存", parentId: null, inbox: false }, 1)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const saveSpy = vi.fn<typeof saveNote>(async (...args) => {
      if (saveSpy.mock.calls.length === 1) await firstGate
      return saveNote(...args)
    })
    renderWorkspace({ initialEntry: `/notes?note=${note.id}`, services: { saveNote: saveSpy } })
    const body = await screen.findByLabelText("Markdown 正文")

    fireEvent.change(body, { target: { value: "第一稿" } })
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    fireEvent.change(body, { target: { value: "第二稿" } })
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(saveSpy).toHaveBeenCalledTimes(1)
    releaseFirst()
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2))
    await waitFor(async () => expect((await loadNote(db, note.id)).markdown).toBe("第二稿"))
  })

  it("adds a child, moves it to inbox, trashes and restores it", async () => {
    const root = await createNote(db, { title: "计算机科学", parentId: null, inbox: false }, 1)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${root.id}` })

    await user.click(await screen.findByRole("button", { name: "笔记操作" }))
    await user.click(screen.getByRole("button", { name: "新建子笔记" }))
    expect(await screen.findByDisplayValue("未命名笔记")).toBeInTheDocument()
    const childId = (await db.knowledgeNodes.toArray()).find((node) => node.parentId === root.id)?.id
    expect(childId).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "笔记操作" }))
    await user.click(screen.getByRole("button", { name: "移到收件箱" }))
    await user.click(screen.getByRole("button", { name: "笔记收件箱" }))
    expect(await screen.findByRole("button", { name: "打开笔记：未命名笔记" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "打开笔记：未命名笔记" }))
    await user.click(screen.getByRole("button", { name: "笔记操作" }))
    await user.click(screen.getByRole("button", { name: "移到回收站" }))
    expect(screen.getByText("子笔记也会一起进入回收站，可随时恢复。")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "确认移到回收站" }))
    await user.click(screen.getByRole("button", { name: "回收站" }))
    await user.click(await screen.findByRole("button", { name: "打开笔记：未命名笔记" }))
    await user.click(screen.getByRole("button", { name: "恢复笔记" }))
    expect((await db.knowledgeNodes.get(childId!))?.deletedAt).toBeUndefined()
  })

  it("exports the latest saved subtree as Markdown", async () => {
    const root = await createNote(db, { title: "复习资料", parentId: null, inbox: false }, 1)
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${root.id}` })

    await user.type(await screen.findByLabelText("Markdown 正文"), "导出前的修改")
    await user.click(screen.getByRole("button", { name: "导出 Markdown" }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(click).toHaveBeenCalledTimes(1)
    expect((await loadNote(db, root.id)).markdown).toContain("导出前的修改")
  })

  it("keeps a stale local draft visible instead of overwriting a newer database revision", async () => {
    const note = await createNote(db, { title: "并发笔记", parentId: null, inbox: false }, 1)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })
    const body = await screen.findByLabelText("Markdown 正文")

    await user.type(body, "本地旧稿")
    const current = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: note.title, markdown: "另一标签页的新稿" }, current.revision ?? 0, Date.now())

    await user.type(body, "继续")
    expect(await screen.findByText("发现其他页面保存的新版本")).toBeInTheDocument()
    expect(body).toHaveValue("本地旧稿继续")
    expect((await loadNote(db, note.id)).markdown).toBe("另一标签页的新稿")
    expect(screen.getByRole("button", { name: "重新载入当前版本" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "导出本地草稿" })).toBeInTheDocument()
  })
})
