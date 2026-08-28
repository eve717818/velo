import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PWAUpdatePrompt } from "./PWAUpdatePrompt"

describe("PWAUpdatePrompt", () => {
  it("stays hidden when no service-worker message is pending", () => {
    const { container } = render(
      <PWAUpdatePrompt offlineReady={false} needRefresh={false} onClose={vi.fn()} onReload={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("announces when the offline shell is ready", () => {
    render(<PWAUpdatePrompt offlineReady needRefresh={false} onClose={vi.fn()} onReload={vi.fn()} />)

    expect(screen.getByText("应用已可离线使用")).toBeInTheDocument()
  })

  it("offers one explicit reload for a new version", async () => {
    const onReload = vi.fn()
    render(<PWAUpdatePrompt offlineReady={false} needRefresh onClose={vi.fn()} onReload={onReload} />)

    expect(screen.getByText("发现 Velow Notebook 新版本")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "立即更新" }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
