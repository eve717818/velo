import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "@/app/App"

vi.mock("@/pwa/RegisterPWA", () => ({ RegisterPWA: () => null }))

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe("App", () => {
  it("can preview the launch screen without clearing existing onboarding state", async () => {
    localStorage.setItem("velow-notebook:onboarding-complete", "1")
    const originalPath = window.location.href
    window.history.replaceState(null, "", "/?launch=1")
    try {
      render(<App />)
      expect(screen.getByRole("region", { name: "Velow Notebook 欢迎页" })).toBeInTheDocument()
      await userEvent.setup().click(screen.getByRole("button", { name: "Get started" }))
      expect(screen.queryByRole("region", { name: "Velow Notebook 欢迎页" })).not.toBeInTheDocument()
      expect(localStorage.getItem("velow-notebook:onboarding-complete")).toBe("1")
    } finally {
      window.history.replaceState(null, "", originalPath)
    }
  })

  it("exposes the Velow Notebook application root without nesting page landmarks", () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-app-name="Velow Notebook"]')).toBeInTheDocument()
  })

  it("waits for the first Get started action and skips onboarding after completion", async () => {
    const user = userEvent.setup()
    const view = render(<App />)

    expect(screen.getByRole("region", { name: "Velow Notebook 欢迎页" })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe("hidden")
    expect(screen.getByText("Catch ideas")).toBeInTheDocument()
    expect(screen.getByText("Keep flowing")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Get started" }))

    expect(screen.queryByRole("region", { name: "Velow Notebook 欢迎页" })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe("")
    expect(localStorage.getItem("velow-notebook:onboarding-complete")).toBe("1")

    view.unmount()
    render(<App />)
    expect(screen.queryByRole("region", { name: "Velow Notebook 欢迎页" })).not.toBeInTheDocument()
  })

  it("renders the plans shell destination at /plans", async () => {
    const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const originalState = window.history.state as unknown

    try {
      window.history.pushState({}, "", "/plans")

      render(<App />)

      expect(await screen.findByRole("heading", { name: "学习计划" })).toBeInTheDocument()
    } finally {
      window.history.replaceState(originalState, "", originalPath)
    }
  })
})
