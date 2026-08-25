import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { PrimaryNav } from "./PrimaryNav"

const primaryLabels = ["首页", "计划", "笔记", "专注"]

describe("PrimaryNav", () => {
  it("keeps settings out of the mobile primary navigation", () => {
    render(
      <MemoryRouter>
        <PrimaryNav variant="mobile" />
      </MemoryRouter>,
    )

    for (const label of primaryLabels) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument()
    }

    expect(screen.queryByRole("link", { name: "设置" })).not.toBeInTheDocument()
  })

  it("adds settings to the rail navigation", () => {
    render(
      <MemoryRouter>
        <PrimaryNav variant="rail" />
      </MemoryRouter>,
    )

    expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument()
  })
})
