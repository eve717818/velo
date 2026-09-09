import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { saveDailyInspiration } from "./daily-inspiration-service"
import { createFolder, createNote, loadNote, saveNote } from "./note-service"
import { NotesWorkspace, type NoteServiceOverrides } from "./NotesWorkspace"
import styles from "./NotesWorkspace.module.css"

let db: VeloDB

function renderWorkspace(options?: { initialEntry?: string; services?: NoteServiceOverrides }) {
  return render(
    <MemoryRouter initialEntries={[options?.initialEntry ?? "/notes"]}>
      <NotesWorkspace db={db} services={options?.services} />
    </MemoryRouter>,
  )
}

function FolderHistoryNavigation({ noteId }: { noteId: string }) {
  const navigate = useNavigate()

  return (
    <>
      <button onClick={() => void navigate(`/notes?note=${noteId}`)} type="button">在历史中打开深层笔记</button>
      <button onClick={() => void navigate(-1)} type="button">后退</button>
      <button onClick={() => void navigate(1)} type="button">前进</button>
    </>
  )
}

function LocationStateProbe() {
  const location = useLocation()
  return <output aria-label="当前位置状态">{JSON.stringify(location.state)}</output>
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前地址">{`${location.pathname}${location.search}|${JSON.stringify(location.state)}`}</output>
}

function HistoryNavigation() {
  const navigate = useNavigate()
  return <><button onClick={() => void navigate(-1)} type="button">历史后退</button><button onClick={() => void navigate(1)} type="button">历史前进</button></>
}

function usePhoneViewport() {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query === "(max-width: 767px)", media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
  })))
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
  it("keeps only Knowledge Tree and Daily Inspiration in the top bar and scopes creation to the selected container", async () => {
    const folder = await createFolder(db, { title: "大学数学", parentId: null }, 1)
    const note = await createNote(db, { title: "线性代数", parentId: folder.id }, 2)
    const user = userEvent.setup()
    renderWorkspace()

    const knowledgeTree = screen.getByRole("button", { name: "知识树" })
    const daily = screen.getByRole("button", { name: "每日灵感" })
    expect(knowledgeTree).toHaveAttribute("aria-pressed", "true")
    expect(daily).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "在笔记库中新建文件夹" })).toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: "大学数学" }))
    expect(await screen.findByRole("button", { name: "在大学数学中新建" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "在笔记库中新建文件夹" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "展开大学数学" }))
    await user.click(screen.getByRole("button", { name: `打开笔记：${note.title}` }))
    await waitFor(() => expect(screen.queryByRole("button", { name: /中新建$/ })).not.toBeInTheDocument())

    await user.click(daily)
    await waitFor(() => expect(knowledgeTree).toHaveAttribute("aria-pressed", "false"))
    expect(daily).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: /中新建$/ })).not.toBeInTheDocument()
  })

  it("shows a focused knowledge tree without a recycle bin and offers a useful empty-tree action", async () => {
    renderWorkspace()

    const directory = screen.getByRole("complementary", { name: "知识树" })
    const knowledgeTree = screen.getByRole("button", { name: "知识树" })
    const daily = screen.getByRole("button", { name: "每日灵感" })
    const tree = within(directory).getByRole("button", { name: "笔记库" })
    expect(knowledgeTree.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tree).toBeInTheDocument()
    expect(within(directory).queryByRole("button", { name: "回收站" })).not.toBeInTheDocument()
    expect(within(directory).getByText("知识树还是空的，请从笔记库开始建立。")).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(directory).getByRole("button", { name: "在笔记库中新建文件夹" }))
    await waitFor(() => expect(within(directory).getByRole("textbox", { name: "文件夹名称" })).toHaveFocus())
    expect(within(directory).getByRole("group", { name: "文件夹名称，位置：笔记库" })).toBeInTheDocument()
  })

  it("normalizes an invalid Daily Inspiration URL to today without creating data or retaining node selection", async () => {
    const folder = await createFolder(db, { title: "不应保留", parentId: null }, 1)
    const note = await createNote(db, { title: "也不应保留", parentId: folder.id }, 2)
    const now = new Date()
    const today = `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`
    render(
      <MemoryRouter initialEntries={[{ pathname: "/notes", search: `?area=daily&date=not-a-date&note=${note.id}`, state: { selectedFolderId: folder.id } }]}>
        <NotesWorkspace db={db} />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText("灵感日历")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText("当前地址")).toHaveTextContent(`/notes?area=daily&date=${today}|null`))
    expect(await db.dailyInspirations.count()).toBe(0)
    expect(screen.queryByLabelText("Markdown 正文")).not.toBeInTheDocument()
  })

  it("keeps the selected inspiration day in browser history", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/notes?area=daily&date=2026-09-07"]}>
        <NotesWorkspace db={db} />
        <HistoryNavigation />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText("灵感正文")).not.toHaveAttribute("readonly"))
    await user.click(await screen.findByRole("button", { name: "2026年9月8日" }))
    await waitFor(() => expect(screen.getByLabelText("当前地址")).toHaveTextContent("?area=daily&date=2026-09-08"))
    expect(screen.getByRole("button", { name: "2026年9月8日" })).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "历史后退" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "2026年9月7日" })).toHaveAttribute("aria-pressed", "true"))
    await user.click(screen.getByRole("button", { name: "历史前进" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "2026年9月8日" })).toHaveAttribute("aria-pressed", "true"))
  })

  it("restores the selected inspiration month when history crosses a month boundary", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/notes?area=daily&date=2026-09-07"]}>
        <NotesWorkspace db={db} />
        <HistoryNavigation />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText("灵感正文")).not.toHaveAttribute("readonly"))
    await user.click(screen.getByRole("button", { name: "下个月" }))
    await user.click(screen.getByRole("button", { name: "2026年10月1日" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "2026年10月1日" })).toHaveAttribute("aria-pressed", "true"))
    await user.click(screen.getByRole("button", { name: "历史后退" }))
    expect(await screen.findByRole("button", { name: "2026年9月7日" })).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "历史前进" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "2026年10月1日" })).toHaveAttribute("aria-pressed", "true"))
  })

  it("waits for a pending inspiration flush before leaving and blocks leaving after a failed flush", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const pendingSave = vi.fn<typeof saveDailyInspiration>(async (...args) => {
      await gate
      return saveDailyInspiration(...args)
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/notes?area=daily&date=2026-09-07"]}>
        <NotesWorkspace db={db} services={{ saveDailyInspiration: pendingSave }} />
        <LocationProbe />
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText("灵感正文"), "先保存再离开")
    await user.click(screen.getByRole("button", { name: "知识树" }))
    expect(screen.getByLabelText("当前地址")).toHaveTextContent("?area=daily&date=2026-09-07")
    release()
    await waitFor(() => expect(screen.getByLabelText("当前地址")).toHaveTextContent("/notes|null"))

    const failedSave = vi.fn<typeof saveDailyInspiration>().mockRejectedValue(new Error("模拟灵感保存失败"))
    render(
      <MemoryRouter initialEntries={["/notes?area=daily&date=2026-09-08"]}>
        <NotesWorkspace db={db} services={{ saveDailyInspiration: failedSave }} />
        <LocationProbe />
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText("灵感正文"), "仍留在这里")
    await user.click(screen.getAllByRole("button", { name: "知识树" }).at(-1)!)
    expect(screen.getAllByLabelText("当前地址").at(-1)).toHaveTextContent("?area=daily&date=2026-09-08")
    expect(await screen.findByText("请先处理当前灵感的保存问题，再打开知识树。")).toBeInTheDocument()
  })

  it("blocks entering Daily Inspiration while the ordinary note cannot flush", async () => {
    const note = await createNote(db, { title: "未保存正文", parentId: null }, 1)
    const rejectSave = vi.fn<typeof saveNote>().mockRejectedValue(new Error("模拟保存失败"))
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}`, services: { saveNote: rejectSave } })

    await user.type(await screen.findByLabelText("Markdown 正文"), "不能丢")
    await screen.findByText("保存失败，草稿仍在本机")
    await user.click(screen.getByRole("button", { name: "每日灵感" }))

    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("不能丢")
    expect(screen.queryByLabelText("灵感日历")).not.toBeInTheDocument()
    expect(screen.getByText("请先处理当前笔记的保存问题，再切换目录。")).toBeInTheDocument()
  })

  it("closes the phone drawer before focusing Daily Inspiration", async () => {
    usePhoneViewport()
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const drawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(drawer).getByRole("button", { name: "关闭知识树" }))
    await user.click(screen.getByRole("button", { name: "每日灵感" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "知识树" })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText("灵感正文")).toHaveFocus())

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const reopenedDrawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(reopenedDrawer).getByRole("button", { name: "关闭知识树" }))
    await user.click(screen.getByRole("button", { name: "每日灵感" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "知识树" })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText("灵感正文")).toHaveFocus())
  })

  it("shows full parent paths inline and the full selected node path in the content pane", async () => {
    const root = await createFolder(db, { title: "专业", parentId: null }, 1)
    const subject = await createFolder(db, { title: "数学", parentId: root.id }, 2)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole("button", { name: "展开专业" }))
    await user.click(screen.getByRole("button", { name: "数学" }))
    expect(await screen.findByText("笔记库 / 专业 / 数学 · 0 个子节点")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "在数学中新建" }))
    await user.click(screen.getByRole("menuitem", { name: "新建笔记" }))
    const createGroup = screen.getByRole("group", { name: "笔记名称，位置：笔记库 / 专业 / 数学" })
    expect(within(createGroup).getByText("位置：笔记库 / 专业 / 数学")).toBeInTheDocument()
    await user.type(within(createGroup).getByRole("textbox", { name: "笔记名称" }), "极限{Enter}")
    expect(await screen.findByRole("navigation", { name: "当前笔记路径" })).toHaveTextContent("笔记库/专业/数学/极限")

    await user.click(screen.getByRole("button", { name: "节点操作：极限" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))
    const renameGroup = screen.getByRole("group", { name: "笔记名称，位置：笔记库 / 专业 / 数学" })
    expect(within(renameGroup).getByText("位置：笔记库 / 专业 / 数学")).toBeInTheDocument()
    expect(subject.parentId).toBe(root.id)
  })

  it("keeps the phone knowledge tree open after folder creation and moves creation beside it", async () => {
    usePhoneViewport()
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const drawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(drawer).getByRole("button", { name: "在笔记库中新建文件夹" }))
    await user.type(within(drawer).getByRole("textbox", { name: "文件夹名称" }), "理科{Enter}")

    expect(await screen.findByRole("dialog", { name: "知识树" })).toBeInTheDocument()
    expect(within(drawer).getByRole("button", { name: "在理科中新建" })).toBeInTheDocument()
    expect(within(drawer).queryByRole("button", { name: "在笔记库中新建文件夹" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "新建子文件夹" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "新建笔记" })).not.toBeInTheDocument()
  })

  it("keeps the phone tree open for a folder and closes it after creating a note", async () => {
    usePhoneViewport()
    const folder = await createFolder(db, { title: "课程", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const drawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(drawer).getByRole("button", { name: "课程" }))
    expect(drawer).toBeInTheDocument()
    expect(within(drawer).getByRole("button", { name: "在课程中新建" })).toBeInTheDocument()

    await user.click(within(drawer).getByRole("button", { name: "在课程中新建" }))
    await user.click(within(drawer).getByRole("menuitem", { name: "新建笔记" }))
    expect(within(drawer).getByRole("group", { name: "笔记名称，位置：笔记库 / 课程" })).toBeInTheDocument()
    await user.type(within(drawer).getByRole("textbox", { name: "笔记名称" }), "第一课{Enter}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "知识树" })).not.toBeInTheDocument())
    expect(await screen.findByRole("navigation", { name: "当前笔记路径" })).toHaveTextContent("笔记库/课程/第一课")
    expect(await screen.findByLabelText("Markdown 正文")).toBeInTheDocument()
    expect((await db.knowledgeNodes.toArray()).find((node) => node.title === "第一课")?.parentId).toBe(folder.id)
  })

  it("creates a folder, a child note, renames the folder and blocks a note as a parent", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "在笔记库中新建文件夹" }))
    await user.type(screen.getByRole("textbox", { name: "文件夹名称" }), "数学{Enter}")
    await user.click(await screen.findByRole("button", { name: "数学" }))
    await user.click(screen.getByRole("button", { name: "在数学中新建" }))
    await user.click(screen.getByRole("menuitem", { name: "新建笔记" }))
    await user.type(screen.getByRole("textbox", { name: "笔记名称" }), "导数{Enter}")

    expect(await screen.findByRole("button", { name: "打开笔记：导数" })).toBeVisible()
    expect(await db.notes.count()).toBe(1)
  })

  it("shows a quiet folder panel instead of mounting the note editor for a selected folder", async () => {
    await createFolder(db, { title: "课程资料", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole("button", { name: "课程资料" }))

    expect(await screen.findByRole("heading", { name: "课程资料" })).toBeInTheDocument()
    expect(screen.getByText("笔记库 / 课程资料 · 0 个子节点")).toBeInTheDocument()
    expect(screen.queryByText("请选择一篇笔记")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Markdown 正文")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("closes the phone directory drawer after opening a note", async () => {
    usePhoneViewport()
    await createNote(db, { title: "手机笔记", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const drawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(drawer).getByRole("button", { name: "打开笔记：手机笔记" }))

    expect(screen.queryByRole("dialog", { name: "知识树" })).not.toBeInTheDocument()
    expect(await screen.findByLabelText("Markdown 正文")).toBeInTheDocument()
  })

  it("collapses a folder without selecting it, restores its descendants and persists the choice", async () => {
    const folder = await createFolder(db, { title: "数学", parentId: null }, 1)
    await createNote(db, { title: "线性代数", parentId: folder.id }, 2)
    await db.appMeta.put({
      key: "notes.expanded-folders",
      value: JSON.stringify([folder.id]),
      updatedAt: 3,
    })
    const user = userEvent.setup()
    renderWorkspace()

    expect(await screen.findByRole("button", { name: "打开笔记：线性代数" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "收起数学" }))

    expect(screen.queryByRole("button", { name: "打开笔记：线性代数" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Markdown 正文")).not.toBeInTheDocument()
    await waitFor(async () => {
      expect((await db.appMeta.get("notes.expanded-folders"))?.value).toBe("[]")
    })

    await user.click(screen.getByRole("button", { name: "展开数学" }))
    expect(await screen.findByRole("button", { name: "打开笔记：线性代数" })).toBeInTheDocument()
  })

  it("opens the ancestor chain for a deep note and exposes type-specific decorative icons", async () => {
    const folderTitles = ["理科", "物理", "量子", "场论", "规范", "对称"]
    const folders = []
    let parentId: string | null = null
    for (const [index, title] of folderTitles.entries()) {
      const folder = await createFolder(db, { title, parentId }, index + 1)
      folders.push(folder)
      parentId = folder.id
    }
    const longTitle = "量".repeat(100)
    const note = await createNote(db, { title: longTitle, parentId }, 7)

    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    const directory = screen.getByRole("complementary", { name: "知识树" })
    const rootButton = await within(directory).findByRole("button", { name: "理科" })
    await within(directory).findByRole("button", { name: "收起对称" })
    const deepestFolderButton = within(directory).getByRole("button", { name: "对称" })
    const noteButton = within(directory).getByRole("button", { name: `打开笔记：${longTitle}` })
    for (const folder of folders) {
      expect(screen.getByRole("button", { name: `收起${folder.title}` })).toHaveAttribute("aria-expanded", "true")
    }
    expect(rootButton.querySelector(".lucide-folder-open")).toHaveAttribute("aria-hidden", "true")
    expect(deepestFolderButton.querySelector(".lucide-folder-open")).toHaveAttribute("aria-hidden", "true")
    expect(noteButton.querySelector(".lucide-file-text")).toHaveAttribute("aria-hidden", "true")
    expect(noteButton.querySelector("span")).toHaveClass(styles.treeLabel)
    expect(directory.querySelectorAll(`.${styles.treeChildren}`)).toHaveLength(folderTitles.length)
    expect(directory.querySelector("[style*='--tree-depth']")).not.toBeInTheDocument()
  })

  it("reopens a deep note's ancestors when history changes the search parameter after mount", async () => {
    const root = await createFolder(db, { title: "历史", parentId: null }, 1)
    const branch = await createFolder(db, { title: "近代", parentId: root.id }, 2)
    const note = await createNote(db, { title: "工业革命", parentId: branch.id }, 3)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/notes", `/notes?note=${note.id}`]} initialIndex={0}>
        <NotesWorkspace db={db} />
        <FolderHistoryNavigation noteId={note.id} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole("button", { name: "在历史中打开深层笔记" }))
    expect(await screen.findByRole("button", { name: "收起历史" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "收起近代" })).toHaveAttribute("aria-expanded", "true")

    await user.click(screen.getByRole("button", { name: "收起历史" }))
    expect(screen.getByRole("button", { name: "展开历史" })).toHaveAttribute("aria-expanded", "false")
    await user.click(screen.getByRole("button", { name: "后退" }))
    await user.click(screen.getByRole("button", { name: "前进" }))

    expect(await screen.findByRole("button", { name: "收起历史" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "收起近代" })).toHaveAttribute("aria-expanded", "true")
  })

  it("keeps the compact phone header labels on one line", () => {
    renderWorkspace()

    expect(screen.getByRole("heading", { name: "笔记工作台" })).toHaveAttribute("data-nowrap", "true")
    expect(screen.getByRole("button", { name: "知识树" }).querySelector("[data-nowrap='true']")).toHaveTextContent("知识树")
    expect(screen.getByRole("button", { name: "每日灵感" }).querySelector("[data-nowrap='true']")).toHaveTextContent("每日灵感")
    expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument()
  })

  it("shows one direct writing surface without reading modes or Markdown format buttons", async () => {
    const note = await createNote(db, { title: "响应式编辑", parentId: null }, 1)
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    expect(await screen.findByLabelText("Markdown 正文")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "阅读" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "分栏" })).not.toBeInTheDocument()
    for (const name of ["二级标题", "加粗", "列表", "引用", "行内代码"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
  })
  it("creates an empty note, edits it and announces a successful autosave", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "在笔记库中新建文件夹" }))
    await user.type(screen.getByRole("textbox", { name: "文件夹名称" }), "课堂笔记{Enter}")
    await user.click(await screen.findByRole("button", { name: "在课堂笔记中新建" }))
    await user.click(screen.getByRole("menuitem", { name: "新建笔记" }))
    await user.type(screen.getByRole("textbox", { name: "笔记名称" }), "未命名笔记{Enter}")
    const body = await screen.findByLabelText("Markdown 正文")
    await user.clear(screen.getByLabelText("笔记标题"))
    await user.type(screen.getByLabelText("笔记标题"), "高等数学")
    await user.type(body, "# 我的课堂笔记")

    expect(await screen.findByText("已保存")).toBeInTheDocument()
    expect((await db.notes.toArray()).some((note) => note.markdown?.includes("我的课堂笔记"))).toBe(true)
  })

  it("flushes the current draft before switching to another note", async () => {
    const first = await createNote(db, { title: "第一篇", parentId: null }, 1)
    const second = await createNote(db, { title: "第二篇", parentId: null }, 2)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${first.id}` })

    const body = await screen.findByLabelText("Markdown 正文")
    await user.type(body, "切换前必须保存")
    await user.click(screen.getByRole("button", { name: "打开笔记：第二篇" }))

    expect(await screen.findByDisplayValue("第二篇")).toBeInTheDocument()
    expect((await loadNote(db, first.id)).markdown).toContain("切换前必须保存")
    expect(second.id).not.toBe(first.id)
  })

  it("blocks selecting a creation container while the current editor cannot save", async () => {
    const note = await createNote(db, { title: "未保存笔记", parentId: null }, 1)
    const rejectSave = vi.fn<typeof saveNote>().mockRejectedValue(new Error("模拟保存失败"))
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}`, services: { saveNote: rejectSave } })

    await user.type(await screen.findByLabelText("Markdown 正文"), "不要丢失")
    await screen.findByText("保存失败，草稿仍在本机")
    const directory = screen.getByRole("complementary", { name: "知识树" })
    await user.click(within(directory).getByRole("button", { name: "笔记库" }))

    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("不要丢失")
    expect(screen.queryByRole("textbox", { name: "文件夹名称" })).not.toBeInTheDocument()
    expect(screen.getByText("请先处理当前笔记的保存问题，再切换目录。")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "在笔记库中新建文件夹" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "节点操作：未保存笔记" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))
    expect(screen.queryByRole("textbox", { name: "笔记名称" })).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "未保存笔记" })).toBeInTheDocument()
  })

  it("creates from the selected folder's contextual action", async () => {
    const folder = await createFolder(db, { title: "课程", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole("button", { name: "课程" }))
    await user.click(screen.getByRole("button", { name: "在课程中新建" }))
    await user.click(screen.getByRole("menuitem", { name: "新建笔记" }))
    await user.type(screen.getByRole("textbox", { name: "笔记名称" }), "第一讲{Enter}")

    await waitFor(async () => expect((await db.knowledgeNodes.toArray()).find((node) => node.title === "第一讲")?.parentId).toBe(folder.id))
  })

  it("stores folder selection in browser history and restores it on forward navigation", async () => {
    const folder = await createFolder(db, { title: "历史目录", parentId: null }, 1)
    const note = await createNote(db, { title: "历史笔记", parentId: null }, 2)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/notes?note=${note.id}`]}>
        <NotesWorkspace db={db} />
        <FolderHistoryNavigation noteId={note.id} />
        <LocationStateProbe />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole("button", { name: "历史目录" }))
    await waitFor(() => expect(screen.getByLabelText("当前位置状态")).toHaveTextContent(folder.id))
    await user.click(screen.getByRole("button", { name: "后退" }))
    expect(await screen.findByLabelText("Markdown 正文")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "前进" }))
    expect(await screen.findByRole("heading", { name: "历史目录" })).toBeInTheDocument()
  })

  it("normalizes a legacy trash URL to the live knowledge tree", async () => {
    const folder = await createFolder(db, { title: "仅在全部笔记", parentId: null }, 1)
    render(
      <MemoryRouter initialEntries={[{ pathname: "/notes", search: "?area=trash", state: { selectedFolderId: folder.id } }]}>
        <NotesWorkspace db={db} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole("heading", { name: folder.title })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "节点操作：仅在全部笔记" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "回收站" })).not.toBeInTheDocument()
  })

  it("keeps previously deleted nodes hidden when opening a legacy trash URL", async () => {
    const note = await createNote(db, { title: "待恢复笔记", parentId: null }, 1)
    await db.knowledgeNodes.update(note.id, { deletedAt: 2, updatedAt: 2 })
    renderWorkspace({ initialEntry: "/notes?area=trash" })

    const directory = screen.getByRole("complementary", { name: "知识树" })
    expect(within(directory).queryByRole("button", { name: "打开笔记：待恢复笔记" })).not.toBeInTheDocument()
    expect(within(directory).getByRole("button", { name: "笔记库" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "恢复笔记" })).not.toBeInTheDocument()
  })

  it("renders title entry in the tree while retaining the selected folder panel", async () => {
    const folder = await createFolder(db, { title: "树内编辑", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole("button", { name: "树内编辑" }))
    await user.click(screen.getByRole("button", { name: "节点操作：树内编辑" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))

    const directory = screen.getByRole("complementary", { name: "知识树" })
    expect(within(directory).getByRole("textbox", { name: "文件夹名称" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: folder.title })).toBeInTheDocument()
  })

  it("reloads a renamed note editor before the next body save", async () => {
    const note = await createNote(db, { title: "旧标题", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    await user.click(await screen.findByRole("button", { name: "节点操作：旧标题" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))
    const renameInput = screen.getByRole("textbox", { name: "笔记名称" })
    await user.clear(renameInput)
    await user.type(renameInput, "新标题{Enter}")

    expect(await screen.findByRole("button", { name: "打开笔记：新标题" })).toBeInTheDocument()
    expect(await screen.findByLabelText("笔记标题")).toHaveValue("新标题")
    await user.type(screen.getByLabelText("Markdown 正文"), "重命名后的正文")
    await waitFor(async () => expect((await loadNote(db, note.id)).markdown).toContain("重命名后的正文"))
    expect((await loadNote(db, note.id)).title).toBe("新标题")
  })

  it("opens the phone directory and focuses the visible tree editor", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(max-width: 767px)", media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
    })))
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "知识树" }))
    const drawer = await screen.findByRole("dialog", { name: "知识树" })
    await user.click(within(drawer).getByRole("button", { name: "在笔记库中新建文件夹" }))

    const input = within(drawer).getByRole("textbox", { name: "文件夹名称" })
    await waitFor(() => expect(input).toHaveFocus())
  })

  it("restores a hidden desktop sidebar before opening a tree editor", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole("button", { name: "收起知识树" }))
    await user.click(screen.getByRole("button", { name: "知识树" }))
    const directory = await screen.findByRole("complementary", { name: "知识树" })
    await user.click(within(directory).getByRole("button", { name: "在笔记库中新建文件夹" }))

    await waitFor(() => expect(within(directory).getByRole("textbox", { name: "文件夹名称" })).toHaveFocus())
  })

  it("returns focus to the root creation trigger after cancelling", async () => {
    const note = await createNote(db, { title: "根笔记", parentId: null }, 1)
    const user = userEvent.setup()
    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    await user.click(await screen.findByRole("button", { name: "笔记库" }))
    const trigger = screen.getByRole("button", { name: "在笔记库中新建文件夹" })
    await user.click(trigger)
    const input = screen.getByRole("textbox", { name: "文件夹名称" })
    await waitFor(() => expect(input).toHaveFocus())
    await user.keyboard("{Escape}")

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it("retains a failed draft and exposes recovery actions", async () => {
    const note = await createNote(db, { title: "离线草稿", parentId: null }, 1)
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
    const note = await createNote(db, { title: "中文输入", parentId: null }, 1)
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
    const note = await createNote(db, { title: "慢速保存", parentId: null }, 1)
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

  it("renames inline with Enter, cancels with Escape, and preserves duplicate sibling titles", async () => {
    const folder = await createFolder(db, { title: "资料", parentId: null }, 1)
    await createFolder(db, { title: "重复", parentId: folder.id }, 2)
    const second = await createFolder(db, { title: "重复", parentId: folder.id }, 3)
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(await screen.findByRole("button", { name: "资料" }))

    await user.click(await screen.findByRole("button", { name: "节点操作：资料" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))
    await user.clear(screen.getByRole("textbox", { name: "文件夹名称" }))
    await user.type(screen.getByRole("textbox", { name: "文件夹名称" }), "资料库{Enter}")
    expect(await screen.findByRole("button", { name: "资料库" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "节点操作：资料库" }))
    await user.click(screen.getByRole("button", { name: "重命名" }))
    await user.clear(screen.getByRole("textbox", { name: "文件夹名称" }))
    await user.type(screen.getByRole("textbox", { name: "文件夹名称" }), "不会保存{Escape}")
    expect(screen.getByRole("button", { name: "资料库" })).toBeVisible()
    expect((await db.knowledgeNodes.get(second.id))?.title).toBe("重复")
  })

  it("moves folders only to live folders outside their own subtree without offering a recycle bin", async () => {
    const source = await createFolder(db, { title: "数学", parentId: null }, 1)
    const child = await createFolder(db, { title: "导数", parentId: source.id }, 2)
    await createNote(db, { title: "极限", parentId: child.id }, 3)
    const target = await createFolder(db, { title: "物理", parentId: null }, 4)
    await createNote(db, { title: "不能作为目标", parentId: null }, 5)
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(await screen.findByRole("button", { name: "数学" }))

    await user.click(await screen.findByRole("button", { name: "节点操作：数学" }))
    await user.click(screen.getByRole("button", { name: "移动" }))
    const destination = screen.getByLabelText("移动到目录")
    expect(destination).toHaveTextContent("笔记库根目录")
    expect(destination).toHaveTextContent("物理")
    expect(destination).not.toHaveTextContent("数学")
    expect(destination).not.toHaveTextContent("导数")
    expect(destination).not.toHaveTextContent("不能作为目标")
    await user.selectOptions(destination, target.id)
    await user.click(screen.getByRole("button", { name: "确认移动" }))
    expect((await db.knowledgeNodes.get(source.id))?.parentId).toBe(target.id)

    await user.click(await screen.findByRole("button", { name: "节点操作：数学" }))
    expect(screen.queryByRole("button", { name: "移到回收站" })).not.toBeInTheDocument()
    expect((await db.knowledgeNodes.get(source.id))?.parentId).toBe(target.id)
    expect((await db.knowledgeNodes.get(child.id))?.parentId).toBe(source.id)
  })

  it("exports the latest saved subtree as Markdown", async () => {
    const root = await createNote(db, { title: "复习资料", parentId: null }, 1)
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
    const note = await createNote(db, { title: "并发笔记", parentId: null }, 1)
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

  it("recovers an older local draft as an explicit conflict after remounting", async () => {
    const note = await createNote(db, { title: "课堂笔记", parentId: null }, 1)
    const initial = await loadNote(db, note.id)
    await saveNote(db, note.id, { title: "课堂笔记", markdown: "远端新版本" }, initial.revision ?? 0, 2)
    localStorage.setItem(`velow-note-draft:${note.id}`, JSON.stringify({
      title: "课堂笔记（本地）",
      markdown: "本地未保存草稿",
      baseRevision: initial.revision ?? 0,
      updatedAt: 3,
    }))
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:recovered-draft")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    const user = userEvent.setup()

    renderWorkspace({ initialEntry: `/notes?note=${note.id}` })

    expect(await screen.findByText("发现其他页面保存的新版本")).toBeInTheDocument()
    expect(screen.getByLabelText("笔记标题")).toHaveValue("课堂笔记（本地）")
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("本地未保存草稿")
    expect((await loadNote(db, note.id)).markdown).toBe("远端新版本")
    expect(localStorage.getItem(`velow-note-draft:${note.id}`)).toContain("本地未保存草稿")

    await user.click(screen.getByRole("button", { name: "导出本地草稿" }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "重新载入当前版本" }))
    expect(await screen.findByLabelText("Markdown 正文")).toHaveValue("远端新版本")
    expect(screen.queryByText("发现其他页面保存的新版本")).not.toBeInTheDocument()
    expect(localStorage.getItem(`velow-note-draft:${note.id}`)).toBeNull()
    expect((await loadNote(db, note.id)).markdown).toBe("远端新版本")
  })
})
