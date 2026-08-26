import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { LocalDataBootstrap } from "./LocalDataBootstrap"

const { seedHomeDemoMock } = vi.hoisted(() => ({
  seedHomeDemoMock: vi.fn(),
}))

vi.mock("@/db/seed", () => ({
  seedHomeDemo: seedHomeDemoMock,
}))

describe("LocalDataBootstrap", () => {
  beforeEach(() => {
    seedHomeDemoMock.mockReset()
  })

  it("holds back its children until local data is ready", async () => {
    seedHomeDemoMock.mockResolvedValue(undefined)
    const db = new VeloDB(`velo-bootstrap-${crypto.randomUUID()}`)

    const view = render(
      <LocalDataBootstrap db={db}>
        <p>应用内容</p>
      </LocalDataBootstrap>,
    )

    expect(await screen.findByText("应用内容")).toBeInTheDocument()
    expect(seedHomeDemoMock).toHaveBeenCalledTimes(1)
    view.unmount()
    await db.delete()
  })

  it("shows initialization failure and retries safely", async () => {
    seedHomeDemoMock.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    const db = new VeloDB(`velo-bootstrap-${crypto.randomUUID()}`)

    const view = render(
      <LocalDataBootstrap db={db}>
        <p>应用内容</p>
      </LocalDataBootstrap>,
    )

    expect(await screen.findByText("本地数据初始化失败")).toBeInTheDocument()
    expect(screen.queryByText("应用内容")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "重试" }))

    expect(await screen.findByText("应用内容")).toBeInTheDocument()
    expect(seedHomeDemoMock).toHaveBeenCalledTimes(2)
    view.unmount()
    await db.delete()
  })
})
