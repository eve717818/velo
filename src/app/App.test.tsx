import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "./App"

describe("App", () => {
  it("exposes the Velo application landmark", () => {
    render(<App />)
    expect(screen.getByRole("application", { name: "Velo" })).toBeInTheDocument()
  })
})
