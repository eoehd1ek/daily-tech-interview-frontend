import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it, vi } from 'vitest'
import App from '../App'
import { apiClient } from '../api/client'
import { server } from '../test/server'

const endpoint = 'http://api.test/api/admin/questions'
const questions = [{ id: 9, title: '인덱스' }, { id: 2, title: 'Java GC' }]
const detail = { id: 9, title: '인덱스', content: '인덱스를 설명해주세요.', criteria: [{ id: 91, content: '조회 이점', maxScore: 100, displayOrder: 1 }] }

function renderAdmin(path = '/admin/questions') {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] })
  return render(<StrictMode><RouterProvider router={router} /></StrictMode>)
}

it('shows loading and the new question link before the list arrives', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get(endpoint, async () => { await gate; return HttpResponse.json(questions) }))
  renderAdmin()
  try {
    expect(screen.getByRole('heading', { name: '질문 관리', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('관리자 질문 목록을 불러오는 중입니다.')
    expect(screen.getByRole('link', { name: '새 질문 만들기' })).toHaveAttribute('href', '/admin/questions/new')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  } finally { release() }
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('uses only the admin list API and preserves response order with keyboard edit navigation', async () => {
  const get = vi.spyOn(apiClient, 'get')
  server.use(
    http.get(endpoint, () => HttpResponse.json(questions)),
    http.get(`${endpoint}/9`, () => HttpResponse.json(detail)),
  )
  renderAdmin()
  const list = await screen.findByRole('list', { name: '관리자 질문 목록' })
  const links = within(list).getAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual(['인덱스', 'Java GC'])
  expect(links[0]).toHaveAttribute('href', '/admin/questions/9/edit')
  expect(links[1]).toHaveAttribute('href', '/admin/questions/2/edit')
  expect(get.mock.calls.every(([path, config]) => path === '/api/admin/questions' && config?.signal)).toBe(true)
  expect(apiClient.defaults.timeout).toBe(0)
  const user = userEvent.setup()
  await user.tab() // Main, admin, new question, then the first list item.
  await user.tab()
  await user.tab()
  await user.tab()
  expect(links[0]).toHaveFocus()
  const before = get.mock.calls.length
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('heading', { name: '질문 수정', level: 1 })).toBeInTheDocument()
  expect(await screen.findByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(screen.getByRole('textbox', { name: '질문 본문' })).toHaveValue(detail.content)
  expect(get.mock.calls.slice(before).every(([path, config]) => path === '/api/admin/questions/9' && config?.signal)).toBe(true)
  expect(get.mock.calls.length).toBeGreaterThan(before)
  expect(screen.getByRole('link', { name: '관리자 질문 목록으로' })).toHaveAttribute('href', '/admin/questions')
})

it('shows an empty state and allows navigation to a blank new editor and back', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json([]) }))
  renderAdmin()
  expect(await screen.findByText('아직 등록된 질문이 없습니다.')).toHaveAttribute('role', 'status')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  const user = userEvent.setup()
  const before = received.mock.calls.length
  await user.click(screen.getByRole('link', { name: '새 질문 만들기' }))
  expect(await screen.findByRole('heading', { name: '새 질문 만들기', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('')
  expect(received).toHaveBeenCalledTimes(before)
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  expect(await screen.findByText('아직 등록된 질문이 없습니다.')).toBeInTheDocument()
  expect(received.mock.calls.length).toBeGreaterThan(before)
})

it('renders a long title and HTML-looking text as plain question titles', async () => {
  const title = ('<script>alert("title")</script> ' + '긴 질문 제목 '.repeat(20)).trimEnd()
  server.use(http.get(endpoint, () => HttpResponse.json([{ id: 1, title }])))
  renderAdmin()
  const link = await screen.findByRole('link', { name: title })
  expect(link.textContent).toBe(title)
  expect(link.querySelector('script')).toBeNull()
  expect(link).toHaveAttribute('href', '/admin/questions/1/edit')
})

it.each(['server', 'network', 'unimplemented'])('recovers from %s failure with a single manual GET retry', async (failure) => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => {
    received()
    if (failure === 'network') return HttpResponse.error()
    if (failure === 'unimplemented') return HttpResponse.json({ status: 404, error: 'Not Found' }, { status: 404 })
    return HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '서버 목록 오류' }, { status: 500 })
  }))
  renderAdmin()
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'server' ? '서버 목록 오류' : '연결 상태')
  expect(screen.getByRole('link', { name: '새 질문 만들기' })).toBeInTheDocument()
  const before = received.mock.calls.length
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(questions) }))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('link', { name: '인덱스' })).toBeInTheDocument()
  expect(received).toHaveBeenCalledTimes(before + 1)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each(['success', 'error'])('cancels pending GET on leaving and ignores late %s', async (outcome) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(apiClient, 'get')
  const started = vi.fn()
  server.use(http.get(endpoint, async () => {
    started()
    await gate
    return outcome === 'success' ? HttpResponse.json(questions)
      : HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '늦은 목록 오류' }, { status: 500 })
  }))
  renderAdmin()
  try {
    await waitFor(() => expect(started).toHaveBeenCalled())
    const signals = get.mock.calls.map(([, config]) => config?.signal)
    expect(signals.some((signal) => signal && !signal.aborted)).toBe(true)
    await userEvent.setup().click(screen.getByRole('link', { name: '새 질문 만들기' }))
    expect(await screen.findByRole('heading', { name: '새 질문 만들기', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue('')
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    expect(get.mock.calls.every(([path]) => path === '/api/admin/questions')).toBe(true)
    await act(async () => {
      release()
      await Promise.allSettled(get.mock.results.map((result) => result.value))
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  } finally { release() }
})

it('links from the user home to admin management without replacing the public list API', async () => {
  server.use(
    http.get('http://api.test/api/questions', () => HttpResponse.json(questions)),
    http.get(endpoint, () => HttpResponse.json(questions)),
  )
  renderAdmin('/')
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('link', { name: '질문 관리' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '메인으로' }))
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
})

it('opens the new editor directly without any API calls', () => {
  const get = vi.spyOn(apiClient, 'get')
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  renderAdmin('/admin/questions/new')
  expect(screen.getByRole('heading', { name: '새 질문 만들기', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue('')
  expect(screen.getByRole('link', { name: '관리자 질문 목록으로' })).toHaveAttribute('href', '/admin/questions')
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

it('opens the edit route directly with only an abortable admin detail GET', async () => {
  const get = vi.spyOn(apiClient, 'get')
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  server.use(http.get(`${endpoint}/9`, () => HttpResponse.json(detail)))
  renderAdmin('/admin/questions/9/edit')
  expect(await screen.findByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(screen.getByRole('heading', { name: '질문 수정', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('조회 이점')
  expect(get.mock.calls.length).toBeGreaterThan(0)
  expect(get.mock.calls.every(([path, config]) => path === '/api/admin/questions/9' && config?.signal)).toBe(true)
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})
