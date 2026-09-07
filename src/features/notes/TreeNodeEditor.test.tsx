import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TreeNodeEditor } from "./TreeNodeEditor"

describe("TreeNodeEditor", () => {
  it("ignores Enter and Escape while an IME composition is in progress", () => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    render(<TreeNodeEditor ariaLabel="文件夹名称" initialValue="资料" onCancel={onCancel} onCommit={onCommit} />)

    const input = screen.getByRole("textbox", { name: "文件夹名称" })
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 })

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("retains the entered title when the rename service rejects it", async () => {
    const user = userEvent.setup()
    render(<TreeNodeEditor ariaLabel="文件夹名称" initialValue="资料" onCancel={vi.fn()} onCommit={vi.fn().mockRejectedValue(new Error("服务暂时不可用"))} />)

    const input = screen.getByRole("textbox", { name: "文件夹名称" })
    await user.clear(input)
    await user.type(input, "新资料{Enter}")

    expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时不可用")
    expect(input).toHaveValue("新资料")
  })
})
