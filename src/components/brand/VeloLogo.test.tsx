import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VeloLogo } from "./VeloLogo"

describe("VeloLogo", () => {
  it("exposes the Velow Notebook horizontal lockup across all supported tones", () => {
    const { rerender } = render(<VeloLogo />)

    const logo = screen.getByRole("img", { name: "Velow Notebook" })

    expect(logo).toHaveAttribute("data-wordmark-font", "Outfit")
    expect(logo).toHaveAttribute("data-logo-layout", "horizontal")
    expect(logo.querySelector("img")).toHaveAttribute("src", "/brand/velow-lockup-horizontal.png")
    expect(screen.queryByText(/微流/)).not.toBeInTheDocument()

    rerender(<VeloLogo tone="mono" />)
    expect(screen.getByRole("img", { name: "Velow Notebook" })).toHaveAttribute("data-tone", "mono")

    rerender(<VeloLogo tone="reverse" />)
    expect(screen.getByRole("img", { name: "Velow Notebook" })).toHaveAttribute("data-tone", "reverse")
  })

  it("supports the reference vertical lockup and mark-only application icon", () => {
    const { rerender } = render(<VeloLogo layout="vertical" />)

    expect(screen.getByRole("img", { name: "Velow Notebook" })).toHaveAttribute(
      "data-logo-layout",
      "vertical",
    )
    expect(screen.getByRole("img", { name: "Velow Notebook" }).querySelectorAll("img")).toHaveLength(3)

    rerender(<VeloLogo compact />)
    const mark = screen.getByRole("img", { name: "Velow Notebook" })
    expect(mark).toHaveAttribute("data-logo-layout", "mark")
    expect(mark.querySelector("img")).toHaveAttribute("src", "/brand/velow-mark.png")
  })
})
