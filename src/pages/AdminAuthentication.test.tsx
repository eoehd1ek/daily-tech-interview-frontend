import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { adminClient, clearAdminSession } from '../api/auth'
import { apiClient } from '../api/client'
import { adminUser, csrfToken, setupAdminAuth } from '../test/adminAuth'
import { server } from '../test/server'

const origin = 'http://api.test'
const detail = { id: 9, title: '인덱스', content: '인덱스를 설명해주세요.', criteria: [{ id: 91, content: '조회 이점', maxScore: 100, displayOrder: 1 }] }

beforeEach(() => {
  setupAdminAuth()
  server.use(
    http.get(`${origin}/api/questions`, () => HttpResponse.json([{ id: 9, title: detail.title }])),
    http.get(`${origin}/api/admin/questions`, () => HttpResponse.json([{ id: 9, title: detail.title }])),
    http.get(`${origin}/api/admin/questions/9`, () => HttpResponse.json(detail)),
  )
})
afterEach(clearAdminSession)

function renderPage(path = '/admin', state?: unknown) {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [{ pathname: path, state }] })
  const view = render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  return { ...view, router }
}

async function loginFields(scope: Pick<typeof screen, 'getByRole' | 'getByLabelText'> = screen) {
  const user = userEvent.setup()
  await user.type(scope.getByRole('textbox', { name: '아이디' }), 'admin')
  await user.type(scope.getByLabelText('비밀번호'), 'test-password')
  return user
}

function authFailure(status: number, code: string, message = code) {
  return HttpResponse.json({ code, message }, { status })
}

it('keeps public pages anonymous with no admin links, credential client, or auth requests', async () => {
  const get = vi.spyOn(adminClient, 'get')
  renderPage('/')
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '질문 관리' })).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
  expect(apiClient.defaults.withCredentials).not.toBe(true)
})

it('checks the session before loading protected lists and maps /admin to questions', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const list = vi.fn()
  server.use(
    http.get(`${origin}/api/auth/me`, async () => { await gate; return HttpResponse.json(adminUser) }),
    http.get(`${origin}/api/admin/questions`, () => { list(); return HttpResponse.json([]) }),
  )
  const { router } = renderPage()
  try {
    expect(screen.getByRole('status')).toHaveTextContent('관리자 세션을 확인하는 중입니다.')
    expect(list).not.toHaveBeenCalled()
  } finally { release() }
  expect(await screen.findByText('아직 등록된 질문이 없습니다.')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin/questions')
})

it('redirects anonymous deep links to login and returns to the requested editor after token rotation', async () => {
  let authenticated = false
  const csrf = vi.fn()
  const post = vi.fn()
  server.use(
    http.get(`${origin}/api/auth/me`, () => authenticated ? HttpResponse.json(adminUser) : authFailure(401, 'AUTHENTICATION_REQUIRED')),
    http.get(`${origin}/api/auth/csrf`, () => { csrf(); return HttpResponse.json({ ...csrfToken, token: authenticated ? 'rotated' : 'anonymous' }) }),
    http.post(`${origin}/api/auth/login`, async ({ request }) => {
      post(await request.json(), request.headers.get('X-CSRF-TOKEN'), request.credentials)
      authenticated = true
      return HttpResponse.json(adminUser)
    }),
  )
  const { router } = renderPage('/admin/questions/9/edit')
  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin/login')
  const user = await loginFields()
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(router.state.location.pathname).toBe('/admin/questions/9/edit')
  expect(csrf).toHaveBeenCalledTimes(2)
  expect(post).toHaveBeenCalledExactlyOnceWith({ loginId: 'admin', password: 'test-password' }, 'anonymous', 'include')
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

it('does not fetch or submit on login entry and validates blank credentials', async () => {
  const get = vi.spyOn(adminClient, 'get')
  const post = vi.spyOn(adminClient, 'post')
  renderPage('/admin/login')
  expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
  await userEvent.setup().click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getByRole('alert')).toHaveTextContent('아이디와 비밀번호를 입력해주세요.')
  expect(post).not.toHaveBeenCalled()
})

it.each([
  [401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.'],
  [403, 'INVALID_CSRF_TOKEN', '로그인 보안 토큰이 만료되었습니다.'],
  [500, 'INTERNAL_SERVER_ERROR', 'INTERNAL_SERVER_ERROR'],
])('keeps login ID and clears password after status %i %s without replay', async (status, code, message) => {
  const post = vi.fn()
  server.use(http.post(`${origin}/api/auth/login`, () => { post(); return authFailure(status, code) }))
  renderPage('/admin/login')
  const user = await loginFields()
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('textbox', { name: '아이디' })).toHaveValue('admin')
  expect(screen.getByLabelText('비밀번호')).toHaveValue('')
  expect(post).toHaveBeenCalledTimes(1)
})

it('blocks immediate duplicate login and falls back from unsafe return locations', async () => {
  const post = vi.fn()
  server.use(http.post(`${origin}/api/auth/login`, () => { post(); return HttpResponse.json(adminUser) }))
  const { router } = renderPage('/admin/login', { returnTo: '//outside.example/admin' })
  await loginFields()
  const form = screen.getByRole('form', { name: '관리자 로그인' })
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin/questions')
  expect(post).toHaveBeenCalledTimes(1)
})

it.each(['nonadmin', 'forbidden'])('does not mount admin content for %s users', async (mode) => {
  const list = vi.fn()
  server.use(
    http.get(`${origin}/api/auth/me`, () => mode === 'nonadmin' ? HttpResponse.json({ ...adminUser, role: 'USER' }) : authFailure(403, 'ACCESS_DENIED')),
    http.get(`${origin}/api/admin/questions`, () => { list(); return HttpResponse.json([]) }),
  )
  const { router } = renderPage('/admin/questions')
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(list).not.toHaveBeenCalled()
})

it.each(['server', 'network'])('retries %s session verification without treating it as logged out', async (mode) => {
  server.use(http.get(`${origin}/api/auth/me`, () => mode === 'server' ? authFailure(500, 'INTERNAL_SERVER_ERROR') : HttpResponse.error()))
  const { router } = renderPage()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin')
  expect(screen.queryByRole('heading', { name: '관리자 로그인' })).not.toBeInTheDocument()
  server.use(http.get(`${origin}/api/auth/me`, () => HttpResponse.json(adminUser)))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
})

it('ignores a late session result after leaving admin', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(adminClient, 'get')
  server.use(http.get(`${origin}/api/auth/me`, async () => { await gate; return HttpResponse.json(adminUser) }))
  const { router } = renderPage()
  try {
    await act(async () => { await router.navigate('/') })
  } finally {
    await act(async () => { release(); await Promise.allSettled(get.mock.results.map((result) => result.value)) })
  }
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
  expect(get.mock.calls.every(([, config]) => config?.signal?.aborted)).toBe(true)
})

it('reauthenticates an expired save while preserving all inputs and requiring a manual retry', async () => {
  let expired = true
  const saves = vi.fn()
  server.use(
    http.put(`${origin}/api/admin/questions/9`, async ({ request }) => {
      saves(await request.json())
      return expired ? authFailure(401, 'AUTHENTICATION_REQUIRED') : HttpResponse.json({ ...detail, title: 'edited title' })
    }),
    http.post(`${origin}/api/auth/login`, () => { expired = false; return HttpResponse.json(adminUser) }),
  )
  renderPage('/admin/questions/9/edit')
  const title = await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.clear(title)
  await user.type(title, 'edited title')
  await user.type(screen.getByRole('textbox', { name: '테스트 답변' }), 'retained answer')
  await user.click(screen.getByRole('button', { name: '저장' }))
  const dialog = await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })
  await loginFields(within(dialog))
  await user.click(within(dialog).getByRole('button', { name: '로그인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue('edited title')
  expect(screen.getByRole('textbox', { name: '질문 본문' })).toHaveValue(detail.content)
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue(detail.criteria[0].content)
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue('retained answer')
  expect(saves).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByText('질문이 저장되었습니다.')).toBeInTheDocument()
  expect(saves).toHaveBeenCalledTimes(2)
})

it('refreshes invalid CSRF only on manual retry without logging out or discarding the form', async () => {
  let rejected = true
  const tokens = vi.fn()
  const saves = vi.fn()
  server.use(
    http.get(`${origin}/api/auth/csrf`, () => { tokens(); return HttpResponse.json({ ...csrfToken, token: rejected ? 'old' : 'fresh' }) }),
    http.put(`${origin}/api/admin/questions/9`, ({ request }) => {
      saves(request.headers.get('X-CSRF-TOKEN'))
      if (rejected) { rejected = false; return authFailure(403, 'INVALID_CSRF_TOKEN') }
      return HttpResponse.json(detail)
    }),
  )
  renderPage('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('보안 토큰이 만료되었습니다.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(saves).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByText('질문이 저장되었습니다.')).toBeInTheDocument()
  expect(tokens).toHaveBeenCalledTimes(2)
  expect(saves.mock.calls).toEqual([['old'], ['fresh']])
})

it('preserves editor inputs on permission errors without assuming session expiry', async () => {
  server.use(http.put(`${origin}/api/admin/questions/9`, () => authFailure(403, 'ACCESS_DENIED')))
  renderPage('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  await userEvent.setup().click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한이 없습니다.')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('logs out with CSRF after explicit confirmation and clears protected content', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const logout = vi.fn()
  server.use(http.post(`${origin}/api/auth/logout`, ({ request }) => {
    logout(request.headers.get('X-CSRF-TOKEN'), request.credentials)
    return new HttpResponse(null, { status: 204 })
  }))
  const { router } = renderPage('/admin/questions')
  await screen.findByRole('list', { name: '관리자 질문 목록' })
  await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin/login')
  expect(logout).toHaveBeenCalledExactlyOnceWith(csrfToken.token, 'include')
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('keeps the session and editor when logout fails or the user cancels', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const logout = vi.fn()
  server.use(http.post(`${origin}/api/auth/logout`, () => { logout(); return authFailure(500, 'INTERNAL_SERVER_ERROR') }))
  renderPage('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(logout).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('INTERNAL_SERVER_ERROR')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(screen.queryByRole('heading', { name: '관리자 로그인' })).not.toBeInTheDocument()
  expect(logout).toHaveBeenCalledTimes(1)
})

it('leaves a dirty editor after confirmed logout without blocking the login redirect', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage('/admin/questions/9/edit')
  const title = await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.type(title, ' unsaved')
  await user.type(screen.getByRole('textbox', { name: '테스트 답변' }), 'unsaved answer')
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '질문 제목' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('retains the preview answer and never replays a paid preview after reauthentication', async () => {
  const previews = vi.fn()
  server.use(
    http.post(`${origin}/api/admin/questions/evaluation-preview`, () => { previews(); return authFailure(401, 'AUTHENTICATION_REQUIRED') }),
    http.post(`${origin}/api/auth/login`, () => HttpResponse.json(adminUser)),
  )
  renderPage('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: '테스트 답변' }), 'answer to retain')
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  const dialog = await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })
  await loginFields(within(dialog))
  await user.click(within(dialog).getByRole('button', { name: '로그인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue('answer to retain')
  expect(screen.getByRole('button', { name: '답변 테스트' })).toBeEnabled()
  expect(previews).toHaveBeenCalledTimes(1)
})

it('can retry an initial admin detail GET after reauth without losing the selected route', async () => {
  let expired = true
  server.use(
    http.get(`${origin}/api/admin/questions/9`, () => expired ? authFailure(401, 'AUTHENTICATION_REQUIRED') : HttpResponse.json(detail)),
    http.post(`${origin}/api/auth/login`, () => { expired = false; return HttpResponse.json(adminUser) }),
  )
  const { router } = renderPage('/admin/questions/9/edit')
  const dialog = await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })
  await loginFields(within(dialog))
  await userEvent.setup().click(within(dialog).getByRole('button', { name: '로그인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(router.state.location.pathname).toBe('/admin/questions/9/edit')
})

it('rejects a non-admin login response without mounting protected pages', async () => {
  const list = vi.fn()
  server.use(
    http.post(`${origin}/api/auth/login`, () => HttpResponse.json({ ...adminUser, role: 'USER' })),
    http.get(`${origin}/api/admin/questions`, () => { list(); return HttpResponse.json([]) }),
  )
  renderPage('/admin/login')
  const user = await loginFields()
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한이 없는 계정입니다.')
  expect(list).not.toHaveBeenCalled()
  expect(screen.getByLabelText('비밀번호')).toHaveValue('')
})

it('does not leave an editor when logout loses connectivity', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  server.use(http.post(`${origin}/api/auth/logout`, () => HttpResponse.error()))
  renderPage('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('연결 상태')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(detail.title)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('can explicitly discard a dirty expired editor without competing navigation dialogs', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  server.use(http.put(`${origin}/api/admin/questions/9`, () => authFailure(401, 'AUTHENTICATION_REQUIRED')))
  renderPage('/admin/questions/9/edit')
  const title = await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.type(title, ' dirty')
  await user.click(screen.getByRole('button', { name: '저장' }))
  const dialog = await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })
  await user.click(within(dialog).getByRole('button', { name: '입력을 버리고 로그인 페이지로' }))
  expect(dialog).toBeInTheDocument()
  confirm.mockReturnValue(true)
  await user.click(within(dialog).getByRole('button', { name: '입력을 버리고 로그인 페이지로' }))
  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it.each(['/admin/../../outside', '/admin/login#again', 'https://outside.example/admin'])('normalizes and rejects an unsafe return target %s', async (returnTo) => {
  server.use(http.post(`${origin}/api/auth/login`, () => HttpResponse.json(adminUser)))
  const { router } = renderPage('/admin/login', { returnTo })
  const user = await loginFields()
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/admin/questions')
})
