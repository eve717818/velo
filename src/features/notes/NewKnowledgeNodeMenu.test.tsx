import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { NewKnowledgeNodeMenu } from "./NewKnowledgeNodeMenu"

describe("NewKnowledgeNodeMenu", () => {
  it("starts a root folder directly instead of offering a note menu", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn().mockResolvedValue(true)
    render(<NewKnowledgeNodeMenu containerTitle="笔记库" onSelect={onSelect} parentId={null} />)

    await user.click(screen.getByRole("button", { name: "在笔记库中新建文件夹" }))

    expect(onSelect).toHaveBeenCalledWith({ type: "folder", parentId: null }, expect.any(HTMLButtonElement))
    expect(screen.queryByRole("menu", { name: "新建节点" })).not.toBeInTheDocument()
  })
})
