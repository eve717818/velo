import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { App } from "@/app/App"

vi.mock("@/pwa/RegisterPWA", () => ({ RegisterPWA: () => null }))

describe("App", () => {
  it("exposes the Velo application root without nesting page landmarks", () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-app-name="Velo"]')).toBeInTheDocument()
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
