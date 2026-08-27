import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "@/app/App"

vi.mock("@/pwa/RegisterPWA", () => ({ RegisterPWA: () => null }))

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
})

describe("App", () => {
  it("exposes the Velo application root without nesting page landmarks", () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-app-name="Velo"]')).toBeInTheDocument()
  })

  it("shows the animated brand promise once per browser session", async () => {
    vi.useFakeTimers()

    const view = render(<App />)

    expect(screen.getByRole("status", { name: "Velo 正在启动" })).toBeInTheDocument()
    expect(screen.getByText("Catch ideas,")).toBeInTheDocument()
    expect(screen.getByText("Keep flowing")).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(1800))
    expect(screen.queryByRole("status", { name: "Velo 正在启动" })).not.toBeInTheDocument()

    view.unmount()
    render(<App />)
    expect(screen.queryByRole("status", { name: "Velo 正在启动" })).not.toBeInTheDocument()
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
