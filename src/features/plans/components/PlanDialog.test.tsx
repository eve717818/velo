import { useState } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PlanDialog } from "./PlanDialog"

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">打开弹窗</button>
      <PlanDialog labelledBy="plan-dialog-heading" onRequestClose={() => setOpen(false)} open={open}>
        <div>
          <h2 id="plan-dialog-heading">共享弹窗</h2>
          <button type="button">主要操作</button>
        </div>
      </PlanDialog>
    </>
  )
}

function mockDialogRect(dialog: HTMLElement) {
  return vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    x: 120,
    y: 180,
    top: 180,
    right: 360,
    bottom: 420,
    left: 120,
    width: 240,
    height: 240,
    toJSON: () => ({}),
  })
}

describe("PlanDialog", () => {
  it("does not close when a click lands on the dialog within its content bounds", async () => {
    const user = userEvent.setup()
    const rendered = render(<DialogHarness />)

    try {
      const trigger = screen.getByRole("button", { name: "打开弹窗" })
      await user.click(trigger)

      const dialog = screen.getByRole("dialog", { name: "共享弹窗" })
      const rectSpy = mockDialogRect(dialog)

      fireEvent.click(dialog, { clientX: 180, clientY: 240 })

      expect(screen.getByRole("dialog", { name: "共享弹窗" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "主要操作" })).toBeInTheDocument()
      rectSpy.mockRestore()
    } finally {
      rendered.unmount()
    }
  })

  it("closes from a backdrop click and restores focus to its trigger", async () => {
    const user = userEvent.setup()
    const rendered = render(<DialogHarness />)

    try {
      const trigger = screen.getByRole("button", { name: "打开弹窗" })
      await user.click(trigger)

      const dialog = screen.getByRole("dialog", { name: "共享弹窗" })
      const rectSpy = mockDialogRect(dialog)

      fireEvent.click(dialog, { clientX: 90, clientY: 240 })

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(trigger).toHaveFocus()
      rectSpy.mockRestore()
    } finally {
      rendered.unmount()
    }
  })
})
