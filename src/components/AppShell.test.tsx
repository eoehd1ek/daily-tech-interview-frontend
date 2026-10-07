import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import theme from '../theme'
import AppShell from './AppShell'

afterEach(() => { vi.unstubAllGlobals() })

function viewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: desktop, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })))
}

function renderShell(admin = false) {
  const logout = vi.fn()
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[admin ? '/admin/questions' : '/']}>
    <AppShell mode={admin ? 'admin' : 'public'} account={admin ? 'admin' : undefined} onLogout={logout}>
      <Routes><Route path="*" element={<h1>테스트 콘텐츠</h1>} /></Routes>
    </AppShell>
  </MemoryRouter></ThemeProvider>)
  return logout
}

it('shows a permanent desktop workspace without exposing admin navigation on public pages', () => {
  viewport(true)
  renderShell()
  expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '메인으로' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('button', { name: '메뉴 열기' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '질문 관리' })).not.toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  expect(screen.getByRole('link', { name: '본문으로 건너뛰기' })).toHaveAttribute('href', '#main-content')
})

it('opens and closes the mobile drawer while keeping page content mounted', async () => {
  viewport(false)
  renderShell()
  const user = userEvent.setup()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: '메뉴 열기' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '메인으로' }))
  await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
  expect(screen.getByRole('heading', { name: '테스트 콘텐츠' })).toBeInTheDocument()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

it('shows admin session controls in the drawer and closes it with the explicit close button', async () => {
  viewport(false)
  const logout = renderShell(true)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }))
  expect(screen.getByRole('navigation', { name: '관리자 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '질문 관리' })).toHaveAttribute('href', '/admin/questions')
  expect(screen.getByRole('link', { name: '일반 서비스' })).toHaveAttribute('href', '/')
  expect(screen.getByText('admin')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(logout).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }))
  await user.click(screen.getByRole('button', { name: '메뉴 닫기' }))
  await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
})

it('dismisses temporary navigation with Escape', async () => {
  viewport(false)
  renderShell()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveFocus()
})
