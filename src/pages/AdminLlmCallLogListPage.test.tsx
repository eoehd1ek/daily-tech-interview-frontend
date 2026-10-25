import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { adminClient, clearAdminSession } from '../api/auth'
import type { LlmCallLogSummary } from '../api/types'
import { adminUser, setupAdminAuth } from '../test/adminAuth'
import { server } from '../test/server'

const endpoint = 'http://api.test/api/admin/llm-call-logs'
const log: LlmCallLogSummary = {
  id: 102, purpose: 'ANSWER_EVALUATION', status: 'SUCCEEDED', provider: 'CODEX_LB',
  requestedModel: 'gpt-6-sol', responseModel: 'gpt-6-sol', startedAt: '2026-10-25T23:59:00Z',
  completedAt: '2026-10-25T23:59:02Z', durationMs: 1980, inputTokens: 0, outputTokens: 300,
  totalTokens: null, failureStage: null,
}
const page = (items = [log], number = 0, size = 20, total = items.length) =>
  ({ items, page: number, size, totalElements: total, totalPages: Math.ceil(total / size) })

beforeEach(setupAdminAuth)
afterEach(clearAdminSession)

function renderPage(path = '/admin/llm-call-logs') {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] })
  return { ...render(<StrictMode><RouterProvider router={router} /></StrictMode>), router }
}

it('loads only credentialed admin GETs, renders KST and keeps null tokens distinct from zero', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ request }) => {
    received(request.credentials, new URL(request.url).search, request.headers.get('X-CSRF-TOKEN'))
    return HttpResponse.json(page())
  }))
  renderPage()
  const table = await screen.findByRole('table', { name: 'LLM 호출 기록' })
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    '상세 정보', '시작 일시 (KST)', '상태', '용도', '요청 모델 / 공급자', '입력 토큰', '출력 토큰', '전체 토큰', '소요 시간',
  ])
  const row = within(table).getAllByRole('row')[1]
  expect(within(row).getAllByRole('cell').map((cell) => cell.getAttribute('data-label'))).toEqual(
    within(table).getAllByRole('columnheader').map((header) => header.textContent),
  )
  expect(within(row).getByRole('link', { name: '로그 102 상세' })).toHaveTextContent(/^#102$/)
  expect(within(within(row).getAllByRole('cell')[0]).getByRole('link', { name: '로그 102 상세' })).toHaveAttribute('href', '/admin/llm-call-logs/102')
  expect(row).toHaveTextContent('2026. 10. 26. 08:59:00')
  expect(within(row).getByText('0')).toBeInTheDocument()
  expect(within(row).getByText('미확인')).toBeInTheDocument()
  expect(within(row).getByText('1,980 ms')).toBeInTheDocument()
  expect(within(row).getByRole('link', { name: '로그 102 상세' })).toHaveAttribute('href', '/admin/llm-call-logs/102')
  expect(received).toHaveBeenCalledWith('include', '?page=0&size=20', null)
  expect(screen.getByText(/한국 시간\(KST/)).toBeInTheDocument()
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

it('applies filters on submit, resets page, and sends inclusive KST date boundaries', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ request }) => {
    const params = new URL(request.url).searchParams
    received(Object.fromEntries(params))
    return HttpResponse.json(page([], Number(params.get('page')), Number(params.get('size')), 0))
  }))
  const { router } = renderPage('/admin/llm-call-logs?page=2&size=20')
  await screen.findByText('검색 조건에 맞는 호출 기록이 없습니다.')
  const user = userEvent.setup()
  fireEvent.change(screen.getByLabelText('시작일 (KST)'), { target: { value: '2026-10-25' } })
  fireEvent.change(screen.getByLabelText('종료일 (KST, 당일 포함)'), { target: { value: '2026-10-25' } })
  await user.click(screen.getByRole('combobox', { name: '상태' }))
  await user.click(screen.getByRole('option', { name: '호출 실패' }))
  await user.click(screen.getByRole('combobox', { name: '용도' }))
  await user.click(screen.getByRole('option', { name: '관리자 미리 평가' }))
  await user.type(screen.getByRole('textbox', { name: '요청 모델' }), 'gpt-6-sol')
  const before = received.mock.calls.length
  expect(received).toHaveBeenCalledTimes(before)
  await user.click(screen.getByRole('button', { name: '검색' }))
  await waitFor(() => expect(received).toHaveBeenCalledWith({ page: '0', size: '20',
    startedFrom: '2026-10-25T00:00:00+09:00', startedTo: '2026-10-26T00:00:00+09:00',
    status: 'FAILED', purpose: 'ADMIN_PREVIEW', model: 'gpt-6-sol' }))
  expect(router.state.location.search).toContain('page=0')
  expect(received).toHaveBeenCalledTimes(before + 1)
  await user.click(screen.getByRole('button', { name: '초기화' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: '요청 모델' })).toHaveValue(''))
  expect(router.state.location.search).toBe('?page=0&size=20')
})

it('validates reversed dates and invalid URL filters without sending a request', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(page()) }))
  renderPage('/admin/llm-call-logs?page=-1')
  expect(await screen.findByRole('alert')).toHaveTextContent('페이지 번호')
  expect(received).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('시작일 (KST)'), { target: { value: '2026-10-26' } })
  fireEvent.change(screen.getByLabelText('종료일 (KST, 당일 포함)'), { target: { value: '2026-10-25' } })
  fireEvent.submit(screen.getByRole('form', { name: '로그 검색' }))
  expect(screen.getByRole('alert')).toHaveTextContent('종료일은 시작일보다 빠를 수 없습니다.')
  expect(received).not.toHaveBeenCalled()
})

it('paginates on the server, preserves filters in detail links and distinguishes out-of-range pages', async () => {
  server.use(http.get(endpoint, ({ request }) => {
    const number = Number(new URL(request.url).searchParams.get('page'))
    return HttpResponse.json(page(number > 2 ? [] : [log], number, 1, 3))
  }))
  const { router } = renderPage('/admin/llm-call-logs?page=0&size=1&status=SUCCEEDED')
  await screen.findByRole('table')
  const user = userEvent.setup()
  expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '다음 페이지' }))
  await screen.findByText('2 / 3 페이지')
  expect(screen.getByRole('link', { name: '로그 102 상세' })).toHaveAttribute('href', '/admin/llm-call-logs/102?page=1&size=1&status=SUCCEEDED')
  await act(async () => { await router.navigate('/admin/llm-call-logs?page=9&size=1&status=SUCCEEDED') })
  expect(await screen.findByText('현재 페이지에 기록이 없습니다. 첫 페이지에서 다시 조회해주세요.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '첫 페이지로' }))
  await screen.findByText('1 / 3 페이지')
})

it.each([403, 500, 'network'] as const)('keeps the session for %s errors and retries manually', async (failure) => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => {
    received()
    return failure === 'network' ? HttpResponse.error() : HttpResponse.json({ code: failure === 403 ? 'ACCESS_DENIED' : 'INTERNAL_SERVER_ERROR', message: '조회 오류' }, { status: failure })
  }))
  renderPage()
  await screen.findByRole('alert')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const before = received.mock.calls.length
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(page()) }))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  await screen.findByRole('table')
  expect(received).toHaveBeenCalledTimes(before + 1)
})

it('retains filters after session expiry and only reloads when requested after login', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: '다시 로그인해주세요.' }, { status: 401 }) }))
  renderPage('/admin/llm-call-logs?status=FAILED&model=gpt-6-sol')
  const dialog = await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })
  const user = userEvent.setup()
  await user.type(within(dialog).getByRole('textbox', { name: '아이디' }), 'admin')
  await user.type(within(dialog).getByLabelText('비밀번호'), 'test-password')
  server.use(http.post('http://api.test/api/auth/login', () => HttpResponse.json(adminUser)))
  const before = received.mock.calls.length
  await user.click(within(dialog).getByRole('button', { name: '로그인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(received).toHaveBeenCalledTimes(before)
  expect(screen.getByRole('textbox', { name: '요청 모델' })).toHaveValue('gpt-6-sol')
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(page()) }))
  await user.click(screen.getByRole('button', { name: '다시 시도' }))
  await screen.findByRole('table')
  expect(received).toHaveBeenCalledTimes(before + 1)
})

it('checks authentication before log access and returns to the filtered deep link after login', async () => {
  let loggedIn = false
  const received = vi.fn()
  server.use(
    http.get('http://api.test/api/auth/me', () => loggedIn ? HttpResponse.json(adminUser) : HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: '로그인 필요' }, { status: 401 })),
    http.post('http://api.test/api/auth/login', () => { loggedIn = true; return HttpResponse.json(adminUser) }),
    http.get(endpoint, () => { received(); return HttpResponse.json(page()) }),
  )
  const { router } = renderPage('/admin/llm-call-logs?status=FAILED')
  await screen.findByRole('heading', { name: '관리자 로그인' })
  expect(received).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: '아이디' }), 'admin')
  await user.type(screen.getByLabelText('비밀번호'), 'password')
  await user.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('table')
  expect(router.state.location.pathname + router.state.location.search).toBe('/admin/llm-call-logs?status=FAILED')
})

it.each(['success', 'error'])('aborts stale requests and ignores late %s when filters change', async (outcome) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const received = vi.fn()
  const get = vi.spyOn(adminClient, 'get')
  server.use(http.get(endpoint, async ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('status') === 'FAILED') return HttpResponse.json(page([{ ...log, id: 103, status: 'FAILED', failureStage: 'MODEL_CALL' }]))
    received()
    await gate
    return outcome === 'success' ? HttpResponse.json(page()) : HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '늦은 오류' }, { status: 500 })
  }))
  const { router } = renderPage()
  try {
    await waitFor(() => expect(received).toHaveBeenCalled())
    const signals = get.mock.calls.filter(([url]) => url === '/api/admin/llm-call-logs').map(([, config]) => config?.signal)
    expect(screen.getByRole('status')).toHaveTextContent('호출 로그를 불러오는 중입니다.')
    await act(async () => { await router.navigate('/admin/llm-call-logs?status=FAILED') })
    await screen.findByRole('link', { name: '로그 103 상세' })
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => { release(); await Promise.allSettled(get.mock.results.map((result) => result.value)) })
    expect(screen.queryByRole('link', { name: '로그 102 상세' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  } finally { release() }
})

it('refreshes saved logs without a POST or polling', async () => {
  const received = vi.fn()
  const post = vi.spyOn(adminClient, 'post')
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(page([{ ...log, status: 'STARTED', completedAt: null, durationMs: null,
    responseModel: null, inputTokens: null, outputTokens: null, totalTokens: null }])) }))
  renderPage()
  await screen.findByRole('table')
  expect(within(screen.getByRole('table')).getByText('시작 기록/종료 미확인')).toBeInTheDocument()
  const before = received.mock.calls.length
  await userEvent.setup().click(screen.getByRole('button', { name: '새로고침' }))
  await screen.findByRole('table')
  expect(received).toHaveBeenCalledTimes(before + 1)
  expect(post).not.toHaveBeenCalled()
})
