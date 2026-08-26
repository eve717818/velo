import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
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

  it("holds back its children while reserving the final shell and cockpit structure", async () => {
    let resolveSeed!: () => void
    seedHomeDemoMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSeed = resolve
      }),
    )
    const db = new VeloDB(`velo-bootstrap-${crypto.randomUUID()}`)

    const view = render(
      <MemoryRouter>
        <LocalDataBootstrap db={db}>
          <p>应用内容</p>
        </LocalDataBootstrap>
      </MemoryRouter>,
    )

    const loadingSurface = screen.getByLabelText("正在准备本地学习数据", { selector: "div" })

    expect(screen.queryByText("应用内容")).not.toBeInTheDocument()
    expect(within(loadingSurface).getByRole("status", { name: "正在准备本地学习数据" })).toBeInTheDocument()
    expect(within(loadingSurface).getByRole("banner")).toBeInTheDocument()
    expect(within(loadingSurface).getByRole("heading", { name: "今日学习进度" })).toBeInTheDocument()
    expect(within(loadingSurface).getByRole("heading", { name: "接下来" })).toBeInTheDocument()
    expect(within(loadingSurface).getByRole("heading", { name: "最近笔记" })).toBeInTheDocument()
    expect(within(loadingSurface).getByRole("heading", { name: "快捷操作" })).toBeInTheDocument()
    expect(seedHomeDemoMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSeed()
      await Promise.resolve()
    })

    expect(await screen.findByText("应用内容")).toBeInTheDocument()
    view.unmount()
    await db.delete()
  })

  it("shows initialization failure and retries safely", async () => {
    seedHomeDemoMock.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    const db = new VeloDB(`velo-bootstrap-${crypto.randomUUID()}`)

    const view = render(
      <MemoryRouter>
        <LocalDataBootstrap db={db}>
          <p>应用内容</p>
        </LocalDataBootstrap>
      </MemoryRouter>,
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
