import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { SwipeDiscoveryHint } from "./SwipeDiscoveryHint"

describe("SwipeDiscoveryHint", () => {
  beforeEach(() => localStorage.clear())

  it("shows once and stays dismissed for later mounts", async () => {
    const user = userEvent.setup()
    const first = render(<SwipeDiscoveryHint visible />)
    expect(screen.getByText("右滑任务卡片即可完成")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "知道了" }))
    expect(screen.queryByText("右滑任务卡片即可完成")).not.toBeInTheDocument()
    first.unmount()
    render(<SwipeDiscoveryHint visible />)
    expect(screen.queryByText("右滑任务卡片即可完成")).not.toBeInTheDocument()
  })
})
