import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VeloLogo } from "./VeloLogo"

describe("VeloLogo", () => {
  it("exposes the Velo name across all supported tones", () => {
    const { rerender } = render(<VeloLogo />)

    const logo = screen.getByRole("img", { name: "Velo" })

    expect(logo).toHaveAttribute("data-wordmark-font", "Outfit")
    expect(logo).toHaveTextContent("Velo")
    expect(screen.queryByText(/微流/)).not.toBeInTheDocument()

    rerender(<VeloLogo tone="mono" />)
    expect(screen.getByRole("img", { name: "Velo" })).toHaveAttribute("data-tone", "mono")

    rerender(<VeloLogo tone="reverse" />)
    expect(screen.getByRole("img", { name: "Velo" })).toHaveAttribute("data-tone", "reverse")
  })
})
