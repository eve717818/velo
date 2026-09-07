import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { KnowledgeNode } from "@/db/types"
import { NoteActionsDialog } from "./NoteActionsDialog"

const source: KnowledgeNode = { id: "source", parentId: null, type: "note", title: "来源", order: 0, createdAt: 1, updatedAt: 1 }
const target: KnowledgeNode = { id: "target", parentId: null, type: "folder", title: "目标", order: 1, createdAt: 1, updatedAt: 1 }

describe("NoteActionsDialog", () => {
  it("resets the move chooser after switching the selected node", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const common = { onAdd: vi.fn(), onRename: vi.fn(), onRequestClose: vi.fn(), onRequestTrash: vi.fn(), open: true }
    const { rerender } = render(<NoteActionsDialog {...common} node={source} nodes={[source, target]} onMove={onMove} />)

    await user.click(screen.getByRole("button", { name: "移动" }))
    await user.selectOptions(screen.getByRole("combobox", { name: "移动到目录" }), target.id)
    rerender(<NoteActionsDialog {...common} node={target} nodes={[source, target]} onMove={onMove} />)

    expect(screen.queryByRole("button", { name: "确认移动" })).not.toBeInTheDocument()
    expect(onMove).not.toHaveBeenCalled()
  })

  it("does not submit a destination that became illegal while the dialog stayed open", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const common = { onAdd: vi.fn(), onRename: vi.fn(), onRequestClose: vi.fn(), onRequestTrash: vi.fn(), open: true }
    const { rerender } = render(<NoteActionsDialog {...common} node={source} nodes={[source, target]} onMove={onMove} />)

    await user.click(screen.getByRole("button", { name: "移动" }))
    await user.selectOptions(screen.getByRole("combobox", { name: "移动到目录" }), target.id)
    rerender(<NoteActionsDialog {...common} node={source} nodes={[source]} onMove={onMove} />)
    await user.click(screen.getByRole("button", { name: "确认移动" }))

    expect(onMove).not.toHaveBeenCalled()
    expect(await screen.findByRole("alert")).toHaveTextContent("目标文件夹已不可用")
  })

  it("resets move state when the same node dialog closes and reopens", async () => {
    const user = userEvent.setup()
    const common = { onAdd: vi.fn(), onMove: vi.fn(), onRename: vi.fn(), onRequestClose: vi.fn(), onRequestTrash: vi.fn() }
    const { rerender } = render(<NoteActionsDialog {...common} node={source} nodes={[source, target]} open />)

    await user.click(screen.getByRole("button", { name: "移动" }))
    await user.selectOptions(screen.getByRole("combobox", { name: "移动到目录" }), target.id)
    rerender(<NoteActionsDialog {...common} node={source} nodes={[source, target]} open={false} />)
    rerender(<NoteActionsDialog {...common} node={source} nodes={[source, target]} open />)

    await user.click(screen.getByRole("button", { name: "移动" }))
    expect(screen.getByRole("combobox", { name: "移动到目录" })).toHaveValue("")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
