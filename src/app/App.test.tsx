import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "@/app/App"

describe("App", () => {
  it("exposes the Velo application landmark", () => {
    render(<App />)
    expect(screen.getByRole("application", { name: "Velo" })).toBeInTheDocument()
  })

  it("renders the plans shell destination at /plans", () => {
    window.history.pushState({}, "", "/plans")

    render(<App />)

    expect(screen.getByRole("heading", { name: "学习计划" })).toBeInTheDocument()
  })
})
