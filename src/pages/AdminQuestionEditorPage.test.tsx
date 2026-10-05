import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router'
import { expect, it, vi } from 'vitest'
import App from '../App'
import { apiClient } from '../api/client'
import type { AdminQuestionDetail, AdminQuestionRequest } from '../api/types'
import { server } from '../test/server'

const endpoint = 'http://api.test/api/admin/questions'
const request: AdminQuestionRequest = {
  title: '  인덱스 제목  ', content: '  인덱스를 설명해주세요.\n둘째 줄  ',
  criteria: [{ content: '  조회 이점을 설명한다.  ', maxScore: 100, displayOrder: 1 }],
}
const detail: AdminQuestionDetail = { ...request, id: 9, criteria: [{ ...request.criteria[0], id: 91 }] }
const answer = '  조회 성능을 개선합니다.\n원문 답변  '
const preview = {
  questionTitle: request.title, answer, score: 82, result: 'PASS',
  strengths: '조회 이점을 설명했습니다.', weaknesses: '탐색 설명이 부족합니다.', improvements: '탐색 과정을 보완하세요.',
}

function HistoryBack() {
  const navigate = useNavigate()
  return <button onClick={() => { void navigate(-1) }}>테스트 뒤로</button>
}

function renderEditor(path = '/admin/questions/new', initialEntries = [path]) {
  const router = createMemoryRouter([{ path: '*', element: <>
    {initialEntries.length > 1 && <HistoryBack />}
    <App />
  </> }], { initialEntries })
  const view = render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  return { ...view, router }
}

async function fillNew() {
  const user = userEvent.setup()
  for (const [label, value] of [['질문 제목', request.title], ['질문 본문', request.content], ['기준 설명 1', request.criteria[0].content]]) {
    await user.click(screen.getByRole('textbox', { name: label }))
    await user.paste(value)
  }
  return user
}

async function enterTestAnswer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('textbox', { name: '테스트 답변' }))
  await user.paste(answer)
}

function form() {
  const element = screen.getByRole('textbox', { name: '질문 제목' }).closest('form')
  if (!element) throw new Error('The editor fields must belong to the save form')
  return element
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function pendingRequest(method: 'post' | 'put', path: string, outcome: 'success' | 'error' = 'success') {
  const response = gate()
  const started = gate()
  const received = vi.fn()
  let signal!: AbortSignal
  const handler = http[method](path, async ({ request: incoming }) => {
    signal = incoming.signal
    received(await incoming.json())
    started.release()
    await response.promise
    if (outcome === 'error') return HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '늦은 요청 오류' }, { status: 500 })
    return path.endsWith('/evaluation-preview') ? HttpResponse.json(preview)
      : HttpResponse.json(detail, { status: method === 'post' ? 201 : 200 })
  })
  return { handler, received, started: started.promise, release: response.release, get signal() { return signal } }
}

async function drain(release: () => void, pending: Promise<unknown>) {
  // Drain axios and the page continuation, not just the MSW handler.
  await act(async () => { release(); await pending.catch(() => undefined) })
}

function mockDetail(value = detail) {
  server.use(http.get(`${endpoint}/9`, () => HttpResponse.json(value)))
}

function mockList() {
  server.use(http.get(endpoint, () => HttpResponse.json([{ id: 9, title: '인덱스' }])))
}

it('starts with blank fields, one 100-point criterion, UTF-16 limits, and separate save/preview buttons', () => {
  const get = vi.spyOn(apiClient, 'get')
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  renderEditor()
  expect(screen.getByRole('heading', { name: '새 질문 만들기', level: 1 })).toBeInTheDocument()
  for (const [label, maxLength] of [['질문 제목', 200], ['질문 본문', 10000], ['기준 설명 1', 1000], ['테스트 답변', 3000]] as const) {
    expect(screen.getByRole('textbox', { name: label })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: label })).toHaveAttribute('maxlength', String(maxLength))
  }
  expect(screen.getAllByRole('group', { name: /평가 기준 \d+/ })).toHaveLength(1)
  expect(screen.getByLabelText('최대 배점 1')).toHaveDisplayValue('100')
  expect(screen.getByLabelText('순서 1')).toHaveDisplayValue('1')
  expect(screen.getByRole('button', { name: '기준 1 제거' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '기준 1 위로' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '기준 1 아래로' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '저장' })).toHaveAttribute('type', 'submit')
  expect(screen.getByRole('button', { name: '답변 테스트' })).toHaveAttribute('type', 'button')
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

it('adds the smallest unused positive order, defaults new scores to 1, and enforces 1 to 10 criteria', async () => {
  mockDetail({ ...detail, criteria: [{ ...detail.criteria[0], displayOrder: 2 }] })
  renderEditor('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '기준 설명 1' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '기준 추가' }))
  expect(screen.getByLabelText('순서 1')).toHaveDisplayValue('1')
  expect(screen.getByLabelText('최대 배점 1')).toHaveDisplayValue('1')
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: '기준 설명 2' })).toHaveValue(request.criteria[0].content)
  for (let count = 2; count < 10; count++) await user.click(screen.getByRole('button', { name: '기준 추가' }))
  expect(screen.getAllByRole('group', { name: /평가 기준 \d+/ })).toHaveLength(10)
  expect(screen.getByRole('button', { name: '기준 추가' })).toBeDisabled()
  for (let count = 10; count > 1; count--) await user.click(screen.getByRole('button', { name: '기준 1 제거' }))
  expect(screen.getAllByRole('group', { name: /평가 기준 \d+/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: '기준 1 제거' })).toBeDisabled()
})

it('sorts details, swaps sparse order values without renumbering, and keeps criterion input identity', async () => {
  mockDetail({ ...detail, criteria: [
    { id: 92, content: '둘째 기준', maxScore: 60, displayOrder: 7 },
    { id: 91, content: '첫째 기준', maxScore: 40, displayOrder: 2 },
  ] })
  const put = vi.spyOn(apiClient, 'put')
  server.use(http.put(`${endpoint}/9`, () => HttpResponse.json(detail)))
  renderEditor('/admin/questions/9/edit')
  const first = await screen.findByRole('textbox', { name: '기준 설명 1' })
  expect(first).toHaveValue('첫째 기준')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '기준 1 아래로' }))
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('둘째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 2' })).toBe(first)
  expect(screen.getByLabelText('순서 1')).toHaveDisplayValue('2')
  expect(screen.getByLabelText('순서 2')).toHaveDisplayValue('7')
  await user.click(screen.getByRole('button', { name: '기준 2 위로' }))
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toBe(first)
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
  expect(put.mock.calls[0]).toEqual(['/api/admin/questions/9', {
    ...request, criteria: [
      { content: '첫째 기준', maxScore: 40, displayOrder: 2 },
      { content: '둘째 기준', maxScore: 60, displayOrder: 7 },
    ],
  }])
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
})

it('reorders manually edited positive order values on blur with positional labels', async () => {
  mockDetail({ ...detail, criteria: [
    { id: 91, content: '첫째 기준', maxScore: 40, displayOrder: 1 },
    { id: 92, content: '둘째 기준', maxScore: 60, displayOrder: 2 },
  ] })
  renderEditor('/admin/questions/9/edit')
  const first = await screen.findByRole('textbox', { name: '기준 설명 1' })
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('순서 1'))
  await user.type(screen.getByLabelText('순서 1'), '5')
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toBe(first)
  await user.tab()
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('둘째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 2' })).toBe(first)
  expect(screen.getByLabelText('순서 2')).toHaveDisplayValue('5')
})

it('normalizes ALL legacy orders after sorting if any order is nonpositive and warns about unsaved repair', async () => {
  mockDetail({ ...detail, criteria: [
    { id: 93, content: '마지막 기준', maxScore: 40, displayOrder: 8 },
    { id: 92, content: '둘째 기준', maxScore: 30, displayOrder: 0 },
    { id: 91, content: '첫째 기준', maxScore: 30, displayOrder: -2 },
  ] })
  renderEditor('/admin/questions/9/edit')
  expect(await screen.findByRole('textbox', { name: '기준 설명 1' })).toHaveValue('첫째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 2' })).toHaveValue('둘째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 3' })).toHaveValue('마지막 기준')
  for (let position = 1; position <= 3; position++) expect(screen.getByLabelText(`순서 ${position}`)).toHaveDisplayValue(String(position))
  expect(screen.getByRole('alert')).toHaveTextContent('순서를 1부터 다시 지정했습니다')
  await userEvent.setup().click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  expect(await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })).toBeInTheDocument()
})

it.each([
  ['질문 제목', '   '], ['질문 본문', '   '], ['기준 설명 1', '   '],
  ['최대 배점 1', ''], ['최대 배점 1', '0'], ['최대 배점 1', '-1'],
  ['최대 배점 1', '1.5'], ['최대 배점 1', '101'], ['최대 배점 1', '99'], ['최대 배점 1', 'abc'],
  ['순서 1', ''], ['순서 1', '0'], ['순서 1', '-1'], ['순서 1', '1.5'], ['순서 1', 'abc'], ['순서 1', '2147483648'],
])('rejects invalid %s=%j before any save or preview transport', async (label, value) => {
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  renderEditor()
  const user = await fillNew()
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  await enterTestAnswer(user)
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

it('rejects duplicate positive order values even when all criterion scores sum to 100', async () => {
  const post = vi.spyOn(apiClient, 'post')
  renderEditor()
  const user = await fillNew()
  await user.click(screen.getByRole('button', { name: '기준 추가' }))
  await user.type(screen.getByRole('textbox', { name: '기준 설명 2' }), '다른 기준')
  fireEvent.change(screen.getByLabelText('최대 배점 1'), { target: { value: '99' } })
  fireEvent.change(screen.getByLabelText('순서 2'), { target: { value: '1' } })
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  expect(post).not.toHaveBeenCalled()
})

it.each([['질문 제목', 200], ['질문 본문', 10000], ['기준 설명 1', 1000]] as const)(
  'rejects %s beyond its UTF-16 limit even for programmatically supplied values', async (label, limit) => {
    const post = vi.spyOn(apiClient, 'post')
    renderEditor()
    const user = await fillNew()
    const overlong = '\u{1f600}'.repeat(limit / 2) + 'x'
    expect(overlong.length).toBe(limit + 1)
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: overlong } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    expect(post).not.toHaveBeenCalled()
  },
)

it('saves without a preview or answer, uses returned detail as baseline, and stays at new URL for future PUT', async () => {
  const get = vi.spyOn(apiClient, 'get')
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  const saved = { ...detail, title: '저장 응답 제목' }
  server.use(
    http.post(endpoint, () => HttpResponse.json(saved, { status: 201 })),
    http.put(`${endpoint}/9`, () => HttpResponse.json({ ...saved, title: '두 번째 제목' })),
  )
  const { router } = renderEditor()
  const user = await fillNew()
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(saved.title))
  expect(post).toHaveBeenCalledExactlyOnceWith('/api/admin/questions', request)
  expect(get).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/admin/questions/new')
  const beforeUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(beforeUnload)
  expect(beforeUnload.defaultPrevented).toBe(false)
  await user.clear(screen.getByRole('textbox', { name: '질문 제목' }))
  await user.type(screen.getByRole('textbox', { name: '질문 제목' }), '두 번째 제목')
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(put).toHaveBeenCalledExactlyOnceWith('/api/admin/questions/9', { ...request, title: '두 번째 제목' })
  expect(post).toHaveBeenCalledTimes(1)
  expect(get).not.toHaveBeenCalled()
  mockList()
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it.each(['post', 'put'] as const)('locks all editor operations for pending %s, rejects immediate double submit, and adds no transport timeout', async (method) => {
  const pending = pendingRequest(method, method === 'post' ? endpoint : `${endpoint}/9`)
  const spy = vi.spyOn(apiClient, method)
  server.use(pending.handler)
  if (method === 'put') mockDetail()
  renderEditor(method === 'post' ? '/admin/questions/new' : '/admin/questions/9/edit')
  if (method === 'post') await fillNew()
  else await screen.findByRole('textbox', { name: '질문 제목' })
  try {
    await act(async () => { fireEvent.submit(form()); fireEvent.submit(form()); await pending.started })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]).toHaveLength(2)
    expect(pending.received).toHaveBeenCalledExactlyOnceWith(request)
    for (const label of ['질문 제목', '질문 본문', '기준 설명 1', '최대 배점 1', '순서 1', '테스트 답변']) expect(screen.getByLabelText(label)).toBeDisabled()
    for (const label of ['저장', '답변 테스트', '기준 추가']) expect(screen.getByRole('button', { name: label })).toBeDisabled()
    expect(apiClient.defaults.timeout).toBe(0)
    expect(pending.signal.aborted).toBe(false)
  } finally { await drain(pending.release, spy.mock.results[0].value) }
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toBeEnabled()
})

it.each([400, 404, 413, 500, 'network'] as const)('preserves edit inputs and dirty state after save %s without automatic retry or GET refresh', async (status) => {
  const get = vi.spyOn(apiClient, 'get')
  const put = vi.spyOn(apiClient, 'put')
  mockDetail()
  server.use(http.put(`${endpoint}/9`, () => status === 'network' ? HttpResponse.error()
    : status === 413 ? new HttpResponse('<html><script>private_proxy_error()</script></html>', { status, headers: { 'Content-Type': 'text/html' } })
      : HttpResponse.json({ code: status === 404 ? 'QUESTION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR', message: '안전한 저장 오류' }, { status })))
  renderEditor('/admin/questions/9/edit')
  const title = await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.type(title, ' 변경')
  await enterTestAnswer(user)
  const before = get.mock.calls.length
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByRole('alert')).not.toHaveTextContent('private_proxy_error')
  expect(title).toHaveValue(request.title + ' 변경')
  expect(screen.getByRole('textbox', { name: '질문 본문' })).toHaveValue(request.content)
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '답변 테스트' })).toBeEnabled()
  expect(put).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledTimes(before)
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  expect(await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })).toBeInTheDocument()
})

it('previews unsaved current form without DB IDs or save calls and displays outcomes beside raw title and answer', async () => {
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  mockDetail()
  server.use(http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json({ ...preview, questionTitle: request.title + ' 변경' })))
  const { router } = renderEditor('/admin/questions/9/edit')
  await screen.findByRole('textbox', { name: '질문 제목' })
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: '질문 제목' }), ' 변경')
  await enterTestAnswer(user)
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  expect(await screen.findByRole('heading', { name: '테스트 결과' })).toBeInTheDocument()
  expect(screen.getAllByRole('status').find((element) => element.textContent?.includes('테스트가 완료되었습니다. 총점 82점, 판정 PASS입니다.'))).toHaveAttribute('aria-live', 'polite')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(request.title + ' 변경')
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
  expect(screen.getByText('총점: 82 / 100점')).toBeInTheDocument()
  for (const text of ['PASS', preview.strengths, preview.weaknesses, preview.improvements]) expect(screen.getByText(text)).toBeInTheDocument()
  expect(post).toHaveBeenCalledExactlyOnceWith('/api/admin/questions/evaluation-preview', { ...request, title: request.title + ' 변경', answer })
  expect(put).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/admin/questions/9/edit')
})

it.each(['질문 제목', '질문 본문', '기준 설명 1', '최대 배점 1', '순서 1', '테스트 답변'])(
  'clears a previous preview when %s changes', async (label) => {
    server.use(http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json(preview)))
    renderEditor()
    const user = await fillNew()
    await enterTestAnswer(user)
    await user.click(screen.getByRole('button', { name: '답변 테스트' }))
    await screen.findByRole('heading', { name: '테스트 결과' })
    fireEvent.change(screen.getByLabelText(label), { target: { value: label === '최대 배점 1' ? '99' : label === '순서 1' ? '2' : '변경된 내용' } })
    expect(screen.queryByRole('heading', { name: '테스트 결과' })).not.toBeInTheDocument()
  },
)

it('clears preview on save, keeps the test answer, and still warns on leaving after a successful save', async () => {
  server.use(
    http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json(preview)),
    http.post(endpoint, () => HttpResponse.json(detail, { status: 201 })),
  )
  renderEditor()
  const user = await fillNew()
  await enterTestAnswer(user)
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  await screen.findByRole('heading', { name: '테스트 결과' })
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(screen.queryByRole('heading', { name: '테스트 결과' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  expect(await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })).toBeInTheDocument()
})

it.each(['   ', 'x'.repeat(3001)])('rejects an invalid preview answer but still allows independent save', async (value) => {
  const post = vi.spyOn(apiClient, 'post')
  server.use(http.post(endpoint, () => HttpResponse.json(detail, { status: 201 })))
  renderEditor()
  const user = await fillNew()
  fireEvent.change(screen.getByRole('textbox', { name: '테스트 답변' }), { target: { value } })
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText(/공백이 아닌 답변을/)).toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(post).toHaveBeenCalledExactlyOnceWith('/api/admin/questions', request)
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(value)
})

it.each([400, 413, 502, 500, 'network'] as const)('preserves all inputs after preview %s and permits save without retrying preview', async (status) => {
  const post = vi.spyOn(apiClient, 'post')
  server.use(
    http.post(`${endpoint}/evaluation-preview`, () => status === 'network' ? HttpResponse.error()
      : status === 413 ? new HttpResponse('<html>private_proxy_error</html>', { status, headers: { 'Content-Type': 'text/html' } })
        : HttpResponse.json({ code: status === 502 ? 'LLM_EVALUATION_FAILED' : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR', message: '안전한 테스트 오류' }, { status })),
    http.post(endpoint, () => HttpResponse.json(detail, { status: 201 })),
  )
  renderEditor()
  const user = await fillNew()
  await enterTestAnswer(user)
  await user.click(screen.getByRole('button', { name: '답변 테스트' }))
  expect(await screen.findByRole('alert')).not.toHaveTextContent('private_proxy_error')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(request.title)
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '답변 테스트' })).toBeEnabled()
  expect(post).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(post).toHaveBeenNthCalledWith(2, '/api/admin/questions', request)
  expect(post).toHaveBeenCalledTimes(2)
})

it.each(['success', 'error'] as const)('expires preview at 180000ms without abort, unlocks everything, and ignores late %s during another preview', async (outcome) => {
  const first = pendingRequest('post', `${endpoint}/evaluation-preview`, outcome)
  const second = pendingRequest('post', `${endpoint}/evaluation-preview`)
  const post = vi.spyOn(apiClient, 'post')
  server.use(first.handler)
  renderEditor()
  const user = await fillNew()
  await enterTestAnswer(user)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '답변 테스트' }))
      fireEvent.click(screen.getByRole('button', { name: '답변 테스트' }))
      fireEvent.submit(form())
      await first.started
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]).toHaveLength(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(179999) })
    for (const label of ['질문 제목', '질문 본문', '기준 설명 1', '최대 배점 1', '순서 1', '테스트 답변']) expect(screen.getByLabelText(label)).toBeDisabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('alert')).toHaveTextContent(/다시|재시도/)
    expect(first.signal.aborted).toBe(false)
    for (const label of ['질문 제목', '질문 본문', '기준 설명 1', '최대 배점 1', '순서 1', '테스트 답변']) expect(screen.getByLabelText(label)).toBeEnabled()
    for (const label of ['저장', '답변 테스트', '기준 추가']) expect(screen.getByRole('button', { name: label })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
    expect(post).toHaveBeenCalledTimes(1)
    server.use(second.handler)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '답변 테스트' })); await second.started })
    await drain(first.release, post.mock.results[0].value)
    expect(first.signal.aborted).toBe(false)
    expect(screen.getByRole('textbox', { name: '질문 제목' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: '테스트 결과' })).not.toBeInTheDocument()
    expect(screen.queryByText('늦은 요청 오류')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
    await drain(second.release, post.mock.results[1].value)
    expect(screen.getByRole('heading', { name: '테스트 결과' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  } finally {
    await drain(first.release, post.mock.results[0].value)
    second.release()
    if (post.mock.results[1]) await drain(second.release, post.mock.results[1].value)
    vi.useRealTimers()
  }
})

it('cancels link navigation without losing inputs, confirms it explicitly, and marks browser beforeunload dirty', async () => {
  mockList()
  const { router } = renderEditor()
  const user = await fillNew()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  const dialog = await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })
  await user.click(within(dialog).getByRole('button', { name: '계속 편집' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(router.state.location.pathname).toBe('/admin/questions/new')
  expect(screen.getByRole('textbox', { name: '질문 제목' })).toHaveValue(request.title)
  await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
  await user.click(within(await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })).getByRole('button', { name: '나가기' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
})

it('blocks history POP for a test-answer-only draft and supports cancel then confirm', async () => {
  mockList()
  const { router } = renderEditor('/admin/questions/new', ['/admin/questions', '/admin/questions/new'])
  const user = userEvent.setup()
  await enterTestAnswer(user)
  await user.click(screen.getByRole('button', { name: '테스트 뒤로' }))
  const dialog = await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })
  await user.click(within(dialog).getByRole('button', { name: '계속 편집' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(router.state.location.pathname).toBe('/admin/questions/new')
  expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
  await user.click(screen.getByRole('button', { name: '테스트 뒤로' }))
  await user.click(within(await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })).getByRole('button', { name: '나가기' }))
  expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
})

it.each(['post', 'put', 'preview'] as const)('never aborts pending %s on confirmed leaving or applies its late response', async (operation) => {
  const method = operation === 'put' ? 'put' : 'post'
  const path = operation === 'preview' ? `${endpoint}/evaluation-preview` : operation === 'put' ? `${endpoint}/9` : endpoint
  const pending = pendingRequest(method, path)
  const spy = vi.spyOn(apiClient, method)
  mockList()
  server.use(pending.handler)
  if (operation === 'put') mockDetail()
  const { router } = renderEditor(operation === 'put' ? '/admin/questions/9/edit' : '/admin/questions/new')
  const user = operation === 'put' ? userEvent.setup() : await fillNew()
  if (operation === 'put') await screen.findByRole('textbox', { name: '질문 제목' })
  if (operation === 'preview') await enterTestAnswer(user)
  try {
    await user.click(screen.getByRole('button', { name: operation === 'preview' ? '답변 테스트' : '저장' }))
    await pending.started
    await user.click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
    const dialog = await screen.findByRole('dialog', { name: '입력을 버리고 이동할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '나가기' }))
    expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
    expect(pending.signal.aborted).toBe(false)
    await drain(pending.release, spy.mock.results[0].value)
    expect(pending.signal.aborted).toBe(false)
    expect(router.state.location.pathname).toBe('/admin/questions')
    expect(screen.queryByRole('heading', { name: '테스트 결과' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
  } finally { await drain(pending.release, spy.mock.results[0].value) }
})

it.each(['success', 'error'] as const)('aborts detail GET on clean navigation and ignores late %s', async (outcome) => {
  const response = gate()
  const started = gate()
  const get = vi.spyOn(apiClient, 'get')
  server.use(http.get(`${endpoint}/9`, async () => {
    started.release()
    await response.promise
    return outcome === 'success' ? HttpResponse.json(detail)
      : HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '늦은 상세 오류' }, { status: 500 })
  }))
  mockList()
  renderEditor('/admin/questions/9/edit')
  try {
    await started.promise
    const calls = get.mock.calls.map(([, config]) => config?.signal)
    expect(calls.some((signal) => signal && !signal.aborted)).toBe(true)
    await userEvent.setup().click(screen.getByRole('link', { name: '관리자 질문 목록으로' }))
    expect(await screen.findByRole('list', { name: '관리자 질문 목록' })).toBeInTheDocument()
    expect(calls.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => { response.release(); await Promise.allSettled(get.mock.results.map((result) => result.value)) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '질문 제목' })).not.toBeInTheDocument()
  } finally { response.release() }
})

it('exchanges dragged criterion order values while preserving unrelated criteria and stable inputs', async () => {
  mockDetail({ ...detail, criteria: [
    { id: 91, content: '첫째 기준', maxScore: 30, displayOrder: 2 },
    { id: 92, content: '둘째 기준', maxScore: 30, displayOrder: 5 },
    { id: 93, content: '셋째 기준', maxScore: 40, displayOrder: 9 },
  ] })
  renderEditor('/admin/questions/9/edit')
  const first = await screen.findByRole('textbox', { name: '기준 설명 1' })
  const setData = vi.fn()
  fireEvent.dragStart(screen.getByRole('button', { name: '기준 1 드래그 교환' }), { dataTransfer: { setData } })
  fireEvent.dragOver(screen.getByRole('group', { name: '평가 기준 3' }))
  fireEvent.drop(screen.getByRole('group', { name: '평가 기준 3' }))
  expect(setData).toHaveBeenCalledWith('text/plain', expect.any(String))
  expect(screen.getByRole('textbox', { name: '기준 설명 1' })).toHaveValue('셋째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 2' })).toHaveValue('둘째 기준')
  expect(screen.getByRole('textbox', { name: '기준 설명 3' })).toBe(first)
  for (const [position, order] of [[1, 2], [2, 5], [3, 9]]) expect(screen.getByLabelText(`순서 ${position}`)).toHaveDisplayValue(String(order))
  expect(screen.getByLabelText('최대 배점 1')).toHaveDisplayValue('40')
  expect(screen.getByLabelText('최대 배점 2')).toHaveDisplayValue('30')
})

it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rejects invalid edit route ID %s without any API request', (id) => {
  const get = vi.spyOn(apiClient, 'get')
  const post = vi.spyOn(apiClient, 'post')
  const put = vi.spyOn(apiClient, 'put')
  renderEditor(`/admin/questions/${id}/edit`)
  expect(screen.getByRole('alert')).toHaveTextContent('잘못된 질문 ID')
  expect(screen.queryByRole('textbox', { name: '질문 제목' })).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

it.each([400, 404, 500, 'network'] as const)('handles initial detail %s safely and retries only explicitly for recoverable failures', async (status) => {
  const get = vi.spyOn(apiClient, 'get')
  server.use(http.get(`${endpoint}/9`, () => status === 'network' ? HttpResponse.error()
    : HttpResponse.json({ code: status === 404 ? 'QUESTION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR', message: '안전한 상세 오류' }, { status })))
  renderEditor('/admin/questions/9/edit')
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 404 ? '질문을 찾을 수 없습니다.' : status === 'network' ? '연결 상태' : '안전한 상세 오류')
  expect(screen.queryByRole('textbox', { name: '질문 제목' })).not.toBeInTheDocument()
  const before = get.mock.calls.length
  if (status === 400 || status === 404) {
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(before)
    return
  }
  mockDetail()
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('textbox', { name: '질문 제목' })).toHaveValue(request.title)
  expect(get).toHaveBeenCalledTimes(before + 1)
})

it.each(['idle', 'saving'] as const)('ignores expired preview success before another preview while %s', async (next) => {
  const old = pendingRequest('post', `${endpoint}/evaluation-preview`)
  const save = pendingRequest('post', endpoint)
  const post = vi.spyOn(apiClient, 'post')
  server.use(old.handler, save.handler)
  renderEditor()
  const user = await fillNew()
  await enterTestAnswer(user)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '답변 테스트' })); await old.started })
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    const warning = screen.getByRole('alert').textContent
    if (next === 'saving') await act(async () => { fireEvent.submit(form()); await save.started })
    await drain(old.release, post.mock.results[0].value)
    expect(old.signal.aborted).toBe(false)
    expect(screen.queryByRole('heading', { name: '테스트 결과' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(warning!)
    expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', next === 'saving')
    if (next === 'saving') {
      await drain(save.release, post.mock.results[1].value)
      expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
      expect(screen.getByRole('textbox', { name: '테스트 답변' })).toHaveValue(answer)
    }
    expect(post).toHaveBeenCalledTimes(next === 'saving' ? 2 : 1)
  } finally {
    await drain(old.release, post.mock.results[0].value)
    save.release()
    if (post.mock.results[1]) await drain(save.release, post.mock.results[1].value)
    vi.useRealTimers()
  }
})
