import { render, screen, waitFor } from "@testing-library/react"
import userEvent from '@testing-library/user-event'
import { VeloDB } from '@/db/velo-db'
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import { FocusPage } from "./FocusPage"

const databases: VeloDB[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })
describe('FocusPage', () => {
  it('starts free focus, pauses once, resumes and saves on end', async () => {
    const db = new VeloDB(`focus-page-${crypto.randomUUID()}`); databases.push(db)
    const user = userEvent.setup()
    render(<MemoryRouter><FocusPage db={db} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '开始专注' }))
    await user.click(await screen.findByRole('button', { name: '暂停' }))
    expect(await screen.findByText(/本次中断 1 次/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续' }))
    await user.click(screen.getByRole('button', { name: '结束' }))
    expect(await screen.findByText(/心流时间已保存/)).toBeInTheDocument()
    expect((await db.focusSessions.toArray())[0].status).toBe('ended')
  })
  it('uses a real linked task title and safe URL duration', async () => {
    const db = new VeloDB(`focus-page-${crypto.randomUUID()}`); databases.push(db)
    await db.planTasks.add({ id: 'math', title: '导数复习', scope: 'day', periodKey: '2026-09-12', isCompleted: 0, order: 0, createdAt: 0, updatedAt: 0 })
    render(<MemoryRouter initialEntries={['/focus?task=math&minutes=12.5']}><FocusPage db={db} /></MemoryRouter>)
    expect(await screen.findByText('导数复习')).toBeInTheDocument()
    expect(screen.getByLabelText('剩余时间')).toHaveTextContent('25:00')
  })
})
