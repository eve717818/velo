import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { QuickActions } from './QuickActions'

it('clearly marks capture as unavailable without a misleading link', () => {
  render(<MemoryRouter><QuickActions /></MemoryRouter>)
  expect(screen.queryByRole('link', { name: '拍照录入' })).not.toBeInTheDocument()
  expect(screen.getByText('敬请期待')).toBeVisible()
  expect(screen.getByRole('link', { name: '新建笔记' })).toHaveAttribute('href', '/notes?new=1')
  expect(screen.getByRole('link', { name: '开始专注' })).toHaveAttribute('href', '/focus?start=1')
})
