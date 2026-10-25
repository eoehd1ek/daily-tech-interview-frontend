import { StrictMode } from 'react'
import { ThemeProvider } from '@mui/material'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { adminClient, clearAdminSession, subscribeAdminSessionExpired } from '../api/auth'
import type { LlmCallLogDetail } from '../api/types'
import { setupAdminAuth } from '../test/adminAuth'
import { server } from '../test/server'
import theme from '../theme'
import AdminLlmCallLogDetailPage from './AdminLlmCallLogDetailPage'

beforeEach(setupAdminAuth)
afterEach(() => { clearAdminSession(); vi.restoreAllMocks() })

const endpoint = 'http://api.test/api/admin/llm-call-logs'
const log: LlmCallLogDetail = {
  id: 102, purpose: 'ANSWER_EVALUATION', status: 'SUCCEEDED', provider: 'CODEX_LB',
  requestedModel: 'requested-model', responseModel: 'response-model',
  startedAt: '2026-10-25T16:59:00Z', completedAt: '2026-10-25T16:59:02.500Z',
  createdAt: '2026-10-25T16:59:00.005Z', durationMs: 2480,
  inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cachedInputTokens: 200, reasoningTokens: 50,
  failureStage: null, questionId: 9, evaluationAttemptId: 42, responseId: 'chatcmpl-example', finishReason: 'stop',
  requestMessages: [{ role: 'system', content: '평가 지침 원문' }, { role: 'user', content: '{"answer":"사용자 답변 원문"}' }],
  requestOptions: { maxCompletionTokens: 2048, responseFormat: { type: 'json_schema', strict: true }, extra: [true, null, { vendor: '옵션' }] },
  responseData: {
    results: [
      { index: 0, text: '{"strengths":"응답 원문"}', finishReason: 'stop', metadata: { vendor: [1, false, null] } },
      { index: 1, text: null, finishReason: null, metadata: {} },
    ],
    metadata: { nested: { providerExtra: '응답 부가 정보' } },
    usage: { promptTokens: 1200, completionTokens: 300, vendorDetails: { cached: 200 } },
  },
  errorData: null,
}

function renderDetail(path = '/admin/llm-call-logs/102') {
  const router = createMemoryRouter([
    { path: '/admin/llm-call-logs/:logId', element: <AdminLlmCallLogDetailPage /> },
    { path: '/admin/llm-call-logs', element: <p>로그 목록</p> },
  ], { initialEntries: [path] })
  return { ...render(<StrictMode><ThemeProvider theme={theme}><RouterProvider router={router} /></ThemeProvider></StrictMode>), router }
}

function field(section: string, label: string) {
  return within(screen.getByRole('region', { name: section })).getByText(label, { selector: 'dt' }).nextElementSibling
}

async function expand(label: string) {
  const summary = screen.getByText(label, { selector: 'summary' })
  await userEvent.setup().click(summary)
  expect(summary.parentElement).toHaveAttribute('open')
  return summary.nextElementSibling as HTMLElement
}

it('shows loading, every detail section, KST timestamps and unchanged filter back navigation with GET only', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(adminClient, 'get')
  const post = vi.spyOn(adminClient, 'post')
  server.use(http.get(`${endpoint}/102`, async () => { await gate; return HttpResponse.json(log) }))
  const search = '?page=2&status=SUCCEEDED&startedFrom=2026-10-25&startedTo=2026-10-26&model=gpt-6-sol'
  renderDetail('/admin/llm-call-logs/102' + search)
  try {
    expect(screen.getByRole('status')).toHaveTextContent('LLM 호출 로그를 불러오는 중입니다.')
    expect(screen.getByRole('link', { name: 'LLM 호출 로그 목록으로' })).toHaveAttribute('href', '/admin/llm-call-logs' + search)
  } finally { release() }
  expect(await screen.findByRole('region', { name: '기본 정보' })).toBeInTheDocument()
  expect(screen.getAllByRole('region')).toHaveLength(8)
  expect(field('기본 정보', '로그 ID')).toHaveTextContent('102')
  expect(field('기본 정보', '상태')).toHaveTextContent('호출 성공 (SUCCEEDED)')
  expect(field('기본 정보', '용도')).toHaveTextContent('사용자 답변 평가 (ANSWER_EVALUATION)')
  expect(field('기본 정보', '공급자')).toHaveTextContent('CODEX_LB')
  expect(field('기본 정보', '요청 모델')).toHaveTextContent('requested-model')
  expect(field('기본 정보', '응답 모델')).toHaveTextContent('response-model')
  expect(field('기본 정보', '실패 단계')).toHaveTextContent('-')
  expect(screen.getByRole('alert')).toHaveTextContent('평가 기록 저장 성공을 의미하지 않습니다.')
  expect(field('시간 정보', '시작 일시')).toHaveTextContent('2026. 10. 26. 01:59:00.000 KST (Asia/Seoul)')
  expect(field('시간 정보', '완료 일시')).toHaveTextContent('01:59:02.500 KST (Asia/Seoul)')
  expect(field('시간 정보', '생성 일시')).toHaveTextContent('01:59:00.005 KST (Asia/Seoul)')
  expect(field('시간 정보', '호출 소요 시간')).toHaveTextContent('2480 ms')
  for (const [label, value] of [['질문 ID', '9'], ['평가 ID', '42'], ['공급자 응답 ID', 'chatcmpl-example'], ['종료 사유', 'stop']]) {
    expect(field('연결 ID 및 종료 사유', label)).toHaveTextContent(value)
  }
  for (const [label, value] of [['입력 토큰', '1200'], ['출력 토큰', '300'], ['전체 토큰', '1500'], ['캐시 입력 토큰', '200'], ['추론 토큰', '50']]) {
    expect(field('토큰 사용량', label)).toHaveTextContent(value)
  }
  expect((await expand('메시지 1 · system')).textContent).toBe(log.requestMessages[0].content)
  expect((await expand('메시지 2 · user')).textContent).toBe(log.requestMessages[1].content)
  expect((await expand('요청 옵션 JSON')).textContent).toBe(JSON.stringify(log.requestOptions, null, 2))
  expect((await expand('결과 0 원문')).textContent).toBe(log.responseData!.results[0].text)
  expect((await expand('결과 0 메타데이터 JSON')).textContent).toBe(JSON.stringify(log.responseData!.results[0].metadata, null, 2))
  expect((await expand('결과 1 원문')).textContent).toBe('-')
  expect(field('응답 데이터', '결과 1 종료 사유')).toHaveTextContent('-')
  expect((await expand('응답 메타데이터 JSON')).textContent).toBe(JSON.stringify(log.responseData!.metadata, null, 2))
  expect((await expand('상세 사용량 JSON')).textContent).toBe(JSON.stringify(log.responseData!.usage, null, 2))
  expect((await expand('오류 정보 JSON')).textContent).toBe('-')
  expect(get.mock.calls.length).toBeGreaterThan(0)
  expect(get.mock.calls.every(([path, config]) => path === '/api/admin/llm-call-logs/102' && config?.signal)).toBe(true)
  expect(post).not.toHaveBeenCalled()
})

it('renders hostile request, response, metadata, options and error strings literally without HTML or Markdown execution', async () => {
  const hostile = '<script>alert("log")</script><img src=x onerror=alert(1)> **bold** [link](javascript:alert(1))\n' + 'long'.repeat(500)
  const fixture: LlmCallLogDetail = {
    ...log, status: 'FAILED', failureStage: 'RESPONSE_PARSE',
    requestMessages: [{ role: 'system', content: hostile }, { role: 'user', content: hostile }],
    requestOptions: { hostile },
    responseData: { results: [{ index: 0, text: hostile, finishReason: 'stop', metadata: { hostile } }], metadata: { hostile }, usage: { hostile } },
    errorData: { type: hostile, message: hostile, causes: [{ type: 'Cause', message: hostile }, { type: 'Unknown', message: null }] },
  }
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json(fixture)))
  const { container } = renderDetail()
  await screen.findByRole('region', { name: '요청 메시지' })
  for (const label of ['메시지 1 · system', '메시지 2 · user', '결과 0 원문']) {
    expect((await expand(label)).textContent).toBe(hostile)
  }
  for (const [label, value] of [
    ['요청 옵션 JSON', fixture.requestOptions], ['결과 0 메타데이터 JSON', fixture.responseData!.results[0].metadata],
    ['응답 메타데이터 JSON', fixture.responseData!.metadata], ['상세 사용량 JSON', fixture.responseData!.usage], ['오류 정보 JSON', fixture.errorData],
  ] as const) {
    expect((await expand(label)).textContent).toBe(JSON.stringify(value, null, 2))
  }
  expect(container.querySelector('script, img, strong, a[href^="javascript:"]')).toBeNull()
})

it('preserves malformed response text and tokens after response parsing fails', async () => {
  const malformed = '{not valid JSON\n"answer": <broken>'
  const errorData = { type: 'InvalidLlmResponseException', message: '응답 JSON 파싱 실패', causes: [{ type: 'JsonParseException', message: null }] }
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json({
    ...log, status: 'FAILED', failureStage: 'RESPONSE_PARSE', errorData,
    responseData: { ...log.responseData, results: [{ index: 0, text: malformed, finishReason: 'stop', metadata: {} }] },
  })))
  renderDetail()
  await screen.findByText('호출 실패 (FAILED)')
  expect(field('기본 정보', '실패 단계')).toHaveTextContent('RESPONSE_PARSE')
  expect(field('토큰 사용량', '전체 토큰')).toHaveTextContent('1500')
  expect((await expand('결과 0 원문')).textContent).toBe(malformed)
  expect((await expand('오류 정보 JSON')).textContent).toBe(JSON.stringify(errorData, null, 2))
})

it('distinguishes null usage and unknown tokens from zero without computing a total', async () => {
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json({
    ...log, inputTokens: 0, outputTokens: 0, totalTokens: null, cachedInputTokens: null, reasoningTokens: null,
    responseData: { ...log.responseData, usage: null },
  })))
  renderDetail()
  await screen.findByRole('region', { name: '토큰 사용량' })
  expect(field('토큰 사용량', '입력 토큰')?.textContent).toBe('0')
  expect(field('토큰 사용량', '출력 토큰')?.textContent).toBe('0')
  for (const label of ['전체 토큰', '캐시 입력 토큰', '추론 토큰']) expect(field('토큰 사용량', label)?.textContent).toBe('미확인')
  expect((await expand('상세 사용량 JSON')).textContent).toBe('-')
})

it('shows STARTED as an unconfirmed ending with null fields and refreshes once manually without polling', async () => {
  const received = vi.fn()
  server.use(http.get(`${endpoint}/102`, () => {
    received()
    return HttpResponse.json({
      ...log, purpose: 'ADMIN_PREVIEW', status: 'STARTED', responseModel: null, completedAt: null, durationMs: null,
      inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null,
      questionId: null, evaluationAttemptId: null, responseId: null, finishReason: null, responseData: null,
    })
  }))
  renderDetail()
  await screen.findByText('시작 기록/종료 미확인 (STARTED)')
  expect(screen.getByRole('alert')).toHaveTextContent('현재 실행 중이거나 응답·과금이 없었다는 의미는 아닙니다.')
  expect(field('기본 정보', '용도')).toHaveTextContent('관리자 미리 평가')
  expect(field('기본 정보', '응답 모델')?.textContent).toBe('-')
  expect(field('시간 정보', '완료 일시')?.textContent).toBe('-')
  expect(field('시간 정보', '호출 소요 시간')?.textContent).toBe('-')
  expect(field('연결 ID 및 종료 사유', '평가 ID')?.textContent).toBe('-')
  expect(within(screen.getByRole('region', { name: '토큰 사용량' })).getAllByText('미확인')).toHaveLength(5)
  expect(within(screen.getByRole('region', { name: '응답 데이터' })).getByText('-')).toBeInTheDocument()
  const before = received.mock.calls.length
  server.use(http.get(`${endpoint}/102`, () => { received(); return HttpResponse.json(log) }))
  await userEvent.setup().click(screen.getByRole('button', { name: '새로고침' }))
  await screen.findByText('호출 성공 (SUCCEEDED)')
  expect(received).toHaveBeenCalledTimes(before + 1)
})

it('shows a model-call failure with no response and does not imply zero tokens', async () => {
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json({
    ...log, status: 'FAILED', failureStage: 'MODEL_CALL', responseData: null,
    inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null,
    responseId: null, responseModel: null, finishReason: null,
    errorData: { type: 'ModelCallException', message: '모델 호출 실패', causes: [] },
  })))
  renderDetail()
  await screen.findByText('호출 실패 (FAILED)')
  expect(field('기본 정보', '실패 단계')).toHaveTextContent('MODEL_CALL')
  expect(field('토큰 사용량', '전체 토큰')).toHaveTextContent('미확인')
  expect(within(screen.getByRole('region', { name: '응답 데이터' })).getByText('-')).toBeInTheDocument()
  expect(await expand('오류 정보 JSON')).toHaveTextContent('모델 호출 실패')
})

it.each([
  [404, 'LLM_CALL_LOG_NOT_FOUND', 'LLM 호출 기록을 찾을 수 없습니다.'],
  [403, 'ACCESS_DENIED', 'LLM 호출 로그를 조회할 권한이 없습니다.'],
  [500, 'INTERNAL_SERVER_ERROR', '로그 조회 서버 오류'],
  [0, '', '연결 상태'],
])('handles %s retrieval failure without logout and retries with one GET', async (status, code, message) => {
  const received = vi.fn()
  const expired = vi.fn()
  const unsubscribe = subscribeAdminSessionExpired(expired)
  server.use(http.get(`${endpoint}/102`, () => {
    received()
    return status === 0 ? HttpResponse.error() : HttpResponse.json({ code, message }, { status })
  }))
  try {
    renderDetail()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('region', { name: '요청 메시지' })).not.toBeInTheDocument()
    expect(expired).not.toHaveBeenCalled()
    const before = received.mock.calls.length
    server.use(http.get(`${endpoint}/102`, () => { received(); return HttpResponse.json(log) }))
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByText('호출 성공 (SUCCEEDED)')
    expect(received).toHaveBeenCalledTimes(before + 1)
    expect(expired).not.toHaveBeenCalled()
  } finally { unsubscribe() }
})

it('delegates 401 to the existing admin session expiry handler', async () => {
  const expired = vi.fn()
  const unsubscribe = subscribeAdminSessionExpired(expired)
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: '로그인이 필요합니다.' }, { status: 401 })))
  try {
    renderDetail()
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 필요합니다.')
    expect(expired).toHaveBeenCalled()
  } finally { unsubscribe() }
})

it('opens the integrated detail route after the admin session check', async () => {
  const get = vi.spyOn(adminClient, 'get')
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json(log)))
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: ['/admin/llm-call-logs/102?status=SUCCEEDED'],
  })
  render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  expect(await screen.findByRole('heading', { name: 'LLM 호출 로그 상세', level: 1 })).toBeInTheDocument()
  await screen.findByText('호출 성공 (SUCCEEDED)')
  expect(screen.getByRole('link', { name: 'LLM 호출 로그 목록으로' })).toHaveAttribute('href', '/admin/llm-call-logs?status=SUCCEEDED')
  expect(get.mock.calls.some(([path]) => path === '/api/auth/me')).toBe(true)
  expect(get.mock.calls.every(([path, config]) =>
    (path === '/api/auth/me' || path === '/api/admin/llm-call-logs/102') && config?.signal)).toBe(true)
})

it.each([401, 403])('preserves the integrated session behavior for detail HTTP %s', async (status) => {
  server.use(http.get(`${endpoint}/102`, () => HttpResponse.json({
    code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED', message: '접근 오류',
  }, { status })))
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: ['/admin/llm-call-logs/102'],
  })
  render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  if (status === 401) {
    expect(await screen.findByRole('dialog', { name: '세션이 만료되었습니다' })).toBeInTheDocument()
  } else {
    expect(await screen.findByRole('alert')).toHaveTextContent('LLM 호출 로그를 조회할 권한이 없습니다.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled()
  }
  expect(router.state.location.pathname).toBe('/admin/llm-call-logs/102')
})

it.each(['0', '-1', '1.5', 'abc', '1e2', '9007199254740992', '%20', 'Infinity'])('rejects invalid log ID %s without a GET', async (id) => {
  const get = vi.spyOn(adminClient, 'get')
  renderDetail(`/admin/llm-call-logs/${id}?page=1`)
  expect(screen.getByRole('alert')).toHaveTextContent('잘못된 로그 ID입니다.')
  expect(screen.getByRole('link', { name: 'LLM 호출 로그 목록으로' })).toHaveAttribute('href', '/admin/llm-call-logs?page=1')
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
})

it.each(['success', 'error'])('aborts a route-changing GET and ignores its late %s', async (outcome) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(adminClient, 'get')
  const started = vi.fn()
  server.use(
    http.get(`${endpoint}/102`, async () => {
      started()
      await gate
      return outcome === 'success' ? HttpResponse.json(log)
        : HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '오래된 오류' }, { status: 500 })
    }),
    http.get(`${endpoint}/103`, () => HttpResponse.json({ ...log, id: 103, requestedModel: 'current-model' })),
  )
  const { router } = renderDetail()
  try {
    await waitFor(() => expect(started).toHaveBeenCalled())
    const signals = get.mock.calls.filter(([path]) => path === '/api/admin/llm-call-logs/102').map(([, config]) => config?.signal)
    expect(signals.some((signal) => signal && !signal.aborted)).toBe(true)
    await act(async () => { await router.navigate('/admin/llm-call-logs/103?status=FAILED') })
    await screen.findByText('current-model')
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => {
      release()
      await Promise.allSettled(get.mock.results.map((result) => result.value))
    })
    expect(field('기본 정보', '로그 ID')?.textContent).toBe('103')
    expect(field('기본 정보', '요청 모델')?.textContent).toBe('current-model')
    expect(screen.queryByText('오래된 오류')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LLM 호출 로그 목록으로' })).toHaveAttribute('href', '/admin/llm-call-logs?status=FAILED')
  } finally { release() }
})
