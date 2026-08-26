import { render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "./AppShell"

describe("AppShell mobile header", () => {
  it("places the full wordmark and notification before the home greeting while keeping settings reachable", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>早上好，Alex</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const banner = screen.getByRole("banner")
    const greeting = screen.getByRole("heading", { name: "早上好，Alex" })
    const wordmark = within(banner).getByRole("img", { name: "Velo" })

    expect(wordmark).toHaveAttribute("viewBox", "0 0 144 40")
    expect(within(banner).getByRole("button", { name: "通知" })).toBeInTheDocument()
    expect(within(banner).getByRole("button", { name: "打开菜单" })).toBeInTheDocument()
    expect(banner.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
