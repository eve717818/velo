import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { PlansPage } from "./PlansPage"

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前位置">{`${location.pathname}${location.search}`}</output>
}

function createDatabase() {
  return new VeloDB(`velo-plans-page-${crypto.randomUUID()}`)
}

function renderPlansPage(initialEntry: string, db: VeloDB, now = new Date(2026, 7, 29, 9, 0)) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PlansPage db={db} now={now} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe("PlansPage", () => {
  it("switches among all plan views while keeping the selected date in the URL", async () => {
    const db = createDatabase()
    const user = userEvent.setup()
    const rendered = renderPlansPage("/plans?view=day&date=2026-08-28", db)

    try {
      expect(await screen.findByText("0 / 0")).toBeInTheDocument()
      for (const label of ["日", "周", "月", "周期"]) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
      }

      await user.click(screen.getByRole("button", { name: "月" }))

      expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=month&date=2026-08-28")
      expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })

  it("canonicalizes invalid view and date values to the local-day fallback", async () => {
    const db = createDatabase()
    const rendered = renderPlansPage("/plans?view=agenda&date=2026-02-31", db)

    try {
      await waitFor(() => {
        expect(screen.getByLabelText("当前位置")).toHaveTextContent("/plans?view=day&date=2026-08-29")
      })
      expect(screen.getByRole("button", { name: "日" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("计划日期")).toHaveValue("2026-08-29")
    } finally {
      rendered.unmount()
      await db.delete()
    }
  })
})
