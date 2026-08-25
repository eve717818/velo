import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { MobileTopMenu } from "./MobileTopMenu"

function LocationLabel() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderMenu() {
  return render(
    <MemoryRouter>
      <MobileTopMenu />
      <LocationLabel />
    </MemoryRouter>,
  )
}

describe("MobileTopMenu", () => {
  it("opens settings and navigates there from the mobile menu", async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole("button", { name: "打开菜单" }))
    await user.click(screen.getByRole("menuitem", { name: "设置" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/settings")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "打开菜单" })).toHaveFocus()
  })

  it("closes with Escape and restores trigger focus", async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole("button", { name: "打开菜单" })

    await user.click(trigger)
    await user.keyboard("{Escape}")

    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("closes when clicking outside the popover", async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole("button", { name: "打开菜单" }))
    await user.click(document.body)

    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "打开菜单" })).toHaveFocus()
  })
})
