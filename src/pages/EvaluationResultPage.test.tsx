import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { expect, it, vi } from 'vitest'
import type { EvaluationResult } from '../api/types'
import { server } from '../test/server'
import { apiClient } from '../api/client'
import EvaluationResultPage from './EvaluationResultPage'

const endpoint = 'http://api.test/api/evaluation-attempts/:attemptId'
const evaluation: EvaluationResult = {
  id: 42, questionId: 1, questionTitle: '인덱스', answer: '  원문 첫 줄\n둘째 줄  ',
  score: 82, result: 'PASS', strengths: '잘한 내용\n다음 줄',
  weaknesses: '<img src=x onerror=alert(1)> 설명 부족', improvements: '탐색 과정을 설명하세요',
  createdAt: '2026-10-01T07:30:00Z',
}

function renderResult(id = '42') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/results/${id}`]}>
        <Link to="/results/43">다른 결과</Link>
        <Routes><Route path="/results/:attemptId" element={<EvaluationResultPage />} /></Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

it.each(['PASS', 'RETRY', 'FAIL'] as const)('loads %s directly from URL without POST state and displays the saved content', async (result) => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ params }) => {
    received(params.attemptId)
    return HttpResponse.json({ ...evaluation, result })
  }))
  const { container } = renderResult()
  expect(await screen.findByText(result)).toBeInTheDocument()
  expect(received).toHaveBeenCalledWith('42')
  expect(screen.getByText('82 / 100점')).toHaveAttribute('aria-label', '총점 82점, 100점 만점')
  expect(screen.getByText(evaluation.questionTitle)).toBeInTheDocument()
  for (const [name, text] of [
    ['잘 설명한 부분', evaluation.strengths],
    ['부족하거나 잘못 설명한 부분', evaluation.weaknesses],
    ['개선할 부분', evaluation.improvements],
    ['제출한 답변', evaluation.answer],
  ]) {
    const section = screen.getByRole('region', { name })
    expect(within(section).getByRole('heading', { name, level: 2 })).toBeInTheDocument()
    // textContent verifies original whitespace; text queries normalize it by default.
    expect(section.querySelector('p')?.textContent).toBe(text)
    expect(section.querySelector('p')).toHaveStyle({ whiteSpace: 'pre-wrap' })
  }
  expect(container.querySelector('img')).toBeNull()
})

it('does not derive a verdict from the score', async () => {
  // An intentionally inconsistent fixture detects frontend score-threshold logic.
  server.use(http.get(endpoint, () => HttpResponse.json({ ...evaluation, score: 99, result: 'FAIL' })))
  renderResult()
  expect(await screen.findByText('FAIL')).toBeInTheDocument()
  expect(screen.getByText('99 / 100점')).toBeInTheDocument()
  expect(screen.queryByText('PASS')).not.toBeInTheDocument()
})

it.each(['0', '-1', '1abc', '1.5', '1e2', '9007199254740992'])(
  'rejects invalid result ID %s without GET', (id) => {
    const received = vi.fn()
    server.use(http.get(endpoint, () => { received(); return HttpResponse.json(evaluation) }))
    renderResult(id)
    expect(screen.getByRole('alert')).toHaveTextContent('잘못된 평가 ID')
    expect(received).not.toHaveBeenCalled()
  },
)

it('uses the exact safe-integer upper bound for GET', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ params }) => { received(params.attemptId); return HttpResponse.json(evaluation) }))
  renderResult('9007199254740991')
  expect(await screen.findByText('PASS')).toBeInTheDocument()
  expect(received).toHaveBeenCalledWith('9007199254740991')
})

it('shows loading until the saved result arrives', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get(endpoint, async () => { await gate; return HttpResponse.json(evaluation) }))
  renderResult()
  try {
    expect(screen.getByRole('status')).toHaveTextContent('평가 결과를 불러오는 중입니다.')
    expect(screen.queryByText('PASS')).not.toBeInTheDocument()
  } finally { release() }
  expect(await screen.findByText('PASS')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it.each([
  [400, 'INVALID_REQUEST', '잘못된 평가 결과 조회 요청', false],
  [404, 'EVALUATION_ATTEMPT_NOT_FOUND', '평가 결과를 찾을 수 없습니다', false],
  [500, 'INTERNAL_SERVER_ERROR', '결과 서버 오류', true],
])('handles result HTTP %s', async (status, code, message, canRetry) => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code, message: '결과 서버 오류' }, { status })))
  renderResult()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByText('PASS')).not.toBeInTheDocument()
  if (canRetry) expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  else expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
})

it.each(['server', 'network'])('retries %s failures only with GET', async (failure) => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ request }) => {
    received(request.method)
    return failure === 'server'
      ? HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '결과 조회 실패' }, { status: 500 })
      : HttpResponse.error()
  }))
  renderResult()
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'server' ? '결과 조회 실패' : '연결 상태')
  const before = received.mock.calls.length
  server.use(http.get(endpoint, ({ request }) => { received(request.method); return HttpResponse.json(evaluation) }))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByText('PASS')).toBeInTheDocument()
  expect(received).toHaveBeenCalledTimes(before + 1)
  expect(received.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  // There is no POST handler: any accidental POST also fails via the shared network guard.
})

it('clears an existing result while the next result is loading', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get(endpoint, async ({ params }) => {
    if (params.attemptId === '43') await gate
    return HttpResponse.json({ ...evaluation, questionTitle: `결과 ${params.attemptId}` })
  }))
  renderResult()
  try {
    expect(await screen.findByText('결과 42')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('link', { name: '다른 결과' }))
    expect(screen.getByRole('status')).toHaveTextContent('평가 결과를 불러오는 중입니다.')
    expect(screen.queryByText('결과 42')).not.toBeInTheDocument()
    expect(screen.queryByText('PASS')).not.toBeInTheDocument()
  } finally { release() }
  expect(await screen.findByText('결과 43')).toBeInTheDocument()
})

it('cancels an old pending GET and ignores the late result', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(apiClient, 'get')
  const started = vi.fn()
  server.use(http.get(endpoint, async ({ params }) => {
    if (params.attemptId === '42') {
      started()
      await gate
      return HttpResponse.json({ ...evaluation, questionTitle: '이전 결과' })
    }
    return HttpResponse.json({ ...evaluation, id: 43, questionTitle: '새 결과', result: 'RETRY' })
  }))
  renderResult()
  try {
    await waitFor(() => expect(started).toHaveBeenCalled())
    const signals = get.mock.calls.filter(([url]) => url === '/api/evaluation-attempts/42').map(([, config]) => config?.signal)
    expect(signals.some((signal) => signal && !signal.aborted)).toBe(true)
    await userEvent.setup().click(screen.getByRole('link', { name: '다른 결과' }))
    expect(await screen.findByText('새 결과')).toBeInTheDocument()
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => { release(); await gate })
    expect(screen.getByText('새 결과')).toBeInTheDocument()
    expect(screen.getByText('RETRY')).toBeInTheDocument()
    expect(screen.queryByText('이전 결과')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  } finally { release() }
})
