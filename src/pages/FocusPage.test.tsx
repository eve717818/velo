import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { FocusPage } from "./FocusPage"

describe("FocusPage", () => {
  it("shows the linked task context but does not offer completion", () => {
    render(<MemoryRouter initialEntries={["/focus?task=math%20review&minutes=45"]}><FocusPage /></MemoryRouter>)

    expect(screen.getByText("关联任务：math review")).toBeInTheDocument()
    expect(screen.getByText("本次预计 45 分钟")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /完成/ })).not.toBeInTheDocument()
  })

  it("falls back to the default duration for unsafe URL values", () => {
    render(<MemoryRouter initialEntries={["/focus?task=math&minutes=12.5"]}><FocusPage /></MemoryRouter>)

    expect(screen.getByText("本次预计 25 分钟")).toBeInTheDocument()
  })
})
