import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient } from '../api/client'
import type { EvaluationResult } from '../api/types'
import QuestionAnswerPage from './QuestionAnswerPage'
import EvaluationResultPage from './EvaluationResultPage'

const endpoint = 'http://api.test/api/questions/1/evaluation-attempts'
const draft = '  인덱스 설명\n둘째 줄  '
const waitMessage = '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요. 이전 요청은 계속 처리될 수 있으며 다시 제출하면 별도 평가가 생성될 수 있습니다.'
const evaluation: EvaluationResult = {
  id: 42, questionId: 1, questionTitle: '인덱스', answer: draft,
  score: 82, result: 'PASS', strengths: '조회 이점', weaknesses: '탐색 설명 부족',
  improvements: '탐색 과정을 설명하세요', createdAt: '2026-10-01T07:30:00Z',
}

function renderQuestion() {
  server.use(http.get('http://api.test/api/questions/:questionId', ({ params }) =>
    HttpResponse.json({ id: Number(params.questionId), title: '인덱스', content: '인덱스를 설명해주세요.' }),
  ))
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/questions/1']}>
        <Link to="/">메인으로</Link>
        <Link to="/questions/2">다른 질문</Link>
        <Routes>
          <Route path="/" element={<h1>메인 화면</h1>} />
          <Route path="/questions/:questionId" element={<QuestionAnswerPage />} />
          <Route path="/results/:attemptId" element={<EvaluationResultPage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

async function enterAnswer() {
  const user = userEvent.setup()
  const input = await screen.findByRole('textbox', { name: '답변' })
  await user.type(input, draft)
  return { user, input, button: screen.getByRole('button', { name: '답변 제출' }) }
}

function createGate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function gatedPost(outcome: 'success' | 'error', id = 42) {
  const response = createGate()
  const started = createGate()
  const received = vi.fn()
  let signal!: AbortSignal
  const handler = http.post(endpoint, async ({ request }) => {
    signal = request.signal
    received(await request.json())
    started.release()
    await response.promise
    return outcome === 'success'
      ? HttpResponse.json({ ...evaluation, id }, { status: 201 })
      : HttpResponse.json({ code: 'LLM_EVALUATION_FAILED', message: '늦은 평가 실패' }, { status: 502 })
  })
  return { handler, received, started: started.promise, release: response.release, get signal() { return signal } }
}

async function drainPost(release: () => void, pending: Promise<unknown>) {
  // Waiting for axios, not merely the handler gate, drains the page's continuation too.
  await act(async () => { release(); await pending.catch(() => undefined) })
}

describe('answer submission', () => {
  it('rejects whitespace without sending a POST', async () => {
    let posts = 0
    server.use(http.post(endpoint, () => { posts++; return HttpResponse.json(evaluation, { status: 201 }) }))
    renderQuestion()
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: '답변' }), '   ')
    await user.click(screen.getByRole('button', { name: '답변 제출' }))
    expect(screen.getByText(/공백이 아닌 답변/)).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('locks input during analysis, blocks immediate duplicate submits, and navigates on success', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const received = vi.fn()
    const resultGet = vi.fn()
    server.use(
      http.post(endpoint, async ({ request }) => {
        received(await request.json())
        await gate
        return HttpResponse.json(evaluation, { status: 201 })
      }),
      http.get('http://api.test/api/evaluation-attempts/42', () => { resultGet(); return HttpResponse.json(evaluation) }),
    )
    renderQuestion()
    const { input, button } = await enterAnswer()
    const form = screen.getByRole('form', { name: '답변 작성' })
    try {
      act(() => { fireEvent.submit(form); fireEvent.submit(form) })
      expect(await screen.findByText('답변을 분석중입니다.')).toBeInTheDocument()
      expect(input).toBeDisabled()
      expect(button).toBeDisabled()
      await waitFor(() => expect(received).toHaveBeenCalledExactlyOnceWith({ answer: draft }))
    } finally {
      release()
    }
    expect(await screen.findByRole('heading', { name: '평가 결과', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('PASS')).toBeInTheDocument()
    expect(resultGet).toHaveBeenCalled()
    expect(received).toHaveBeenCalledTimes(1)
  })

  it.each([
    [400, 'INVALID_REQUEST', '답변을 확인해주세요'],
    [404, 'QUESTION_NOT_FOUND', '질문을 찾을 수 없습니다'],
    [502, 'LLM_EVALUATION_FAILED', '답변 분석에 실패했습니다'],
    [500, 'INTERNAL_SERVER_ERROR', '서버에서 평가를 완료하지 못했습니다'],
  ])('preserves the draft and unlocks after HTTP %s', async (status, code, message) => {
    const received = vi.fn()
    server.use(http.post(endpoint, async ({ request }) => {
      received(await request.json())
      return HttpResponse.json({ code, message: '서버 안내' }, { status })
    }))
    renderQuestion()
    const { user, input, button } = await enterAnswer()
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(input).toHaveValue(draft)
    expect(input).toBeEnabled()
    expect(button).toBeEnabled()
    expect(screen.queryByText('답변을 분석중입니다.')).not.toBeInTheDocument()
    expect(received).toHaveBeenCalledExactlyOnceWith({ answer: draft })
  })

  it('does not retry network failures automatically, but allows explicit resubmission', async () => {
    const received = vi.fn()
    server.use(http.post(endpoint, () => { received(); return HttpResponse.error() }))
    renderQuestion()
    const { user, input, button } = await enterAnswer()
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('별도의 평가가 생성될 수 있습니다')
    expect(input).toHaveValue(draft)
    expect(button).toBeEnabled()
    expect(received).toHaveBeenCalledTimes(1)
    server.use(
      http.post(endpoint, () => { received(); return HttpResponse.json(evaluation, { status: 201 }) }),
      http.get('http://api.test/api/evaluation-attempts/42', () => HttpResponse.json(evaluation)),
    )
    await user.click(button)
    expect(await screen.findByText('PASS')).toBeInTheDocument()
    expect(received).toHaveBeenCalledTimes(2)
  })

  it('does not repeat POST when result GET fails or is retried', async () => {
    const submitted = vi.fn()
    server.use(
      http.post(endpoint, () => { submitted(); return HttpResponse.json(evaluation, { status: 201 }) }),
      http.get('http://api.test/api/evaluation-attempts/42', () =>
        HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '결과 조회 실패' }, { status: 500 }),
      ),
    )
    renderQuestion()
    const { user, button } = await enterAnswer()
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('결과 조회 실패')
    server.use(http.get('http://api.test/api/evaluation-attempts/42', () => HttpResponse.json(evaluation)))
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('PASS')).toBeInTheDocument()
    expect(submitted).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', ' ', '0', '-1', 'abc', '1.5', 'Infinity', '2147483648'])(
    'rejects invalid wait configuration %j before sending a POST', async (value) => {
      vi.stubEnv('VITE_EVALUATION_TIMEOUT_MS', value)
      const post = vi.spyOn(apiClient, 'post')
      const received = vi.fn()
      server.use(http.post(endpoint, () => { received(); return HttpResponse.json(evaluation, { status: 201 }) }))
      renderQuestion()
      const { user, input, button } = await enterAnswer()
      await user.click(button)
      expect(await screen.findByRole('alert')).toHaveTextContent('VITE_EVALUATION_TIMEOUT_MS')
      expect(input).toHaveValue(draft)
      expect(input).toBeEnabled()
      expect(button).toBeEnabled()
      expect(screen.queryByText('답변을 분석중입니다.')).not.toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
      expect(received).not.toHaveBeenCalled()
    },
  )

  it.each(['success', 'error'] as const)('expires at exactly 180000ms and ignores late %s before resubmission', async (outcome) => {
    const request = gatedPost(outcome)
    const post = vi.spyOn(apiClient, 'post')
    const resultGet = vi.fn()
    server.use(
      request.handler,
      http.get('http://api.test/api/evaluation-attempts/42', () => { resultGet(); return HttpResponse.json(evaluation) }),
    )
    renderQuestion()
    const { input, button } = await enterAnswer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      // Explicit MSW start coordination avoids RTL polling against a fake clock.
      await act(async () => { fireEvent.submit(screen.getByRole('form', { name: '답변 작성' })); await request.started })
      expect(post).toHaveBeenCalledExactlyOnceWith('/api/questions/1/evaluation-attempts', { answer: draft })
      expect(request.received).toHaveBeenCalledExactlyOnceWith({ answer: draft })
      await act(async () => { await vi.advanceTimersByTimeAsync(179999) })
      expect(input).toBeDisabled()
      expect(button).toBeDisabled()
      expect(screen.getByText('답변을 분석중입니다.')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(screen.getByRole('alert').textContent).toBe(waitMessage)
      expect(input).toHaveValue(draft)
      expect(input).toBeEnabled()
      expect(button).toBeEnabled()
      expect(screen.queryByText('답변을 분석중입니다.')).not.toBeInTheDocument()
      expect(request.signal.aborted).toBe(false)
      await drainPost(request.release, post.mock.results[0].value)
      expect(request.signal.aborted).toBe(false)
      expect(screen.getByRole('alert').textContent).toBe(waitMessage)
      expect(input).toHaveValue(draft)
      expect(input).toBeEnabled()
      expect(button).toBeEnabled()
      expect(screen.queryByRole('heading', { name: '평가 결과' })).not.toBeInTheDocument()
      expect(resultGet).not.toHaveBeenCalled()
      expect(post).toHaveBeenCalledTimes(1)
    } finally {
      await drainPost(request.release, post.mock.results[0].value)
      vi.useRealTimers()
    }
  })

  it.each(['success', 'error'] as const)('ignores old %s and its finally while a second submission is pending', async (outcome) => {
    const first = gatedPost(outcome)
    const second = gatedPost('success', 43)
    const post = vi.spyOn(apiClient, 'post')
    const resultGet = vi.fn()
    server.use(
      first.handler,
      http.get('http://api.test/api/evaluation-attempts/:attemptId', ({ params }) => {
        resultGet(Number(params.attemptId))
        return HttpResponse.json({ ...evaluation, id: Number(params.attemptId) })
      }),
    )
    renderQuestion()
    const { input, button } = await enterAnswer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await act(async () => { fireEvent.submit(screen.getByRole('form', { name: '답변 작성' })); await first.started })
      await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
      expect(screen.getByRole('alert').textContent).toBe(waitMessage)
      server.use(second.handler)
      await act(async () => { fireEvent.submit(screen.getByRole('form', { name: '답변 작성' })); await second.started })
      await drainPost(first.release, post.mock.results[0].value)
      expect(first.signal.aborted).toBe(false)
      expect(second.signal.aborted).toBe(false)
      expect(input).toHaveValue(draft)
      expect(input).toBeDisabled()
      expect(button).toBeDisabled()
      expect(screen.getByText('답변을 분석중입니다.')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '평가 결과' })).not.toBeInTheDocument()
      expect(resultGet).not.toHaveBeenCalled()
      act(() => { fireEvent.submit(screen.getByRole('form', { name: '답변 작성' })) })
      expect(post).toHaveBeenCalledTimes(2)
      await act(async () => { await vi.advanceTimersByTimeAsync(179999) })
      expect(button).toBeDisabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await drainPost(second.release, post.mock.results[1].value)
      vi.useRealTimers()
      expect(await screen.findByText('PASS')).toBeInTheDocument()
      expect(resultGet).toHaveBeenCalledWith(43)
      expect(resultGet.mock.calls.every(([id]) => id === 43)).toBe(true)
      expect(post).toHaveBeenNthCalledWith(2, '/api/questions/1/evaluation-attempts', { answer: draft })
      expect(second.received).toHaveBeenCalledExactlyOnceWith({ answer: draft })
      expect(post).toHaveBeenCalledTimes(2)
    } finally {
      await drainPost(first.release, post.mock.results[0].value)
      second.release()
      if (post.mock.results[1]) await drainPost(second.release, post.mock.results[1].value)
      vi.useRealTimers()
    }
  })

  it.each(['success', 'error'] as const)('clears the UI timer after timely %s', async (outcome) => {
    const request = gatedPost(outcome)
    const post = vi.spyOn(apiClient, 'post')
    server.use(
      request.handler,
      http.get('http://api.test/api/evaluation-attempts/42', () => HttpResponse.json(evaluation)),
    )
    renderQuestion()
    const { input, button } = await enterAnswer()
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    try {
      await act(async () => { fireEvent.submit(screen.getByRole('form', { name: '답변 작성' })); await request.started })
      const timerIndex = setTimeout.mock.calls.findIndex(([, delay]) => delay === 180000)
      expect(timerIndex).toBeGreaterThanOrEqual(0)
      const timer = setTimeout.mock.results[timerIndex].value
      await drainPost(request.release, post.mock.results[0].value)
      expect(clearTimeout).toHaveBeenCalledWith(timer)
      expect(screen.queryByText(waitMessage)).not.toBeInTheDocument()
      if (outcome === 'error') {
        expect(screen.getByRole('alert')).toHaveTextContent('답변 분석에 실패했습니다')
        expect(input).toHaveValue(draft)
        expect(input).toBeEnabled()
        expect(button).toBeEnabled()
      }
    } finally {
      await drainPost(request.release, post.mock.results[0].value)
    }
    if (outcome === 'success') expect(await screen.findByText('PASS')).toBeInTheDocument()
  })

  it.each([
    ['unmount', 'success'], ['unmount', 'error'],
    ['/', 'success'], ['/', 'error'],
    ['/questions/2', 'success'], ['/questions/2', 'error'],
  ] as const)('does not abort after leaving for %s or apply its late %s response', async (destination, outcome) => {
    const request = gatedPost(outcome)
    const post = vi.spyOn(apiClient, 'post')
    const resultGet = vi.fn()
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    server.use(
      request.handler,
      http.get('http://api.test/api/evaluation-attempts/42', () => { resultGet(); return HttpResponse.json(evaluation) }),
    )
    const view = renderQuestion()
    const { user, button } = await enterAnswer()
    try {
      await user.click(button)
      await request.started
      expect(post).toHaveBeenCalledExactlyOnceWith('/api/questions/1/evaluation-attempts', { answer: draft })
      const timerIndex = setTimeout.mock.calls.findIndex(([, delay]) => delay === 180000)
      expect(timerIndex).toBeGreaterThanOrEqual(0)
      const timer = setTimeout.mock.results[timerIndex].value
      if (destination === 'unmount') view.unmount()
      else await user.click(screen.getByRole('link', { name: destination === '/' ? '메인으로' : '다른 질문' }))
      expect(clearTimeout).toHaveBeenCalledWith(timer)
      expect(request.signal.aborted).toBe(false)
      if (destination === '/') expect(await screen.findByRole('heading', { name: '메인 화면' })).toBeInTheDocument()
      else if (destination === '/questions/2') expect(await screen.findByRole('textbox', { name: '답변' })).toHaveValue('')
      await drainPost(request.release, post.mock.results[0].value)
      expect(request.signal.aborted).toBe(false)
      expect(resultGet).not.toHaveBeenCalled()
      expect(screen.queryByRole('heading', { name: '평가 결과' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText('답변을 분석중입니다.')).not.toBeInTheDocument()
      if (destination === 'unmount') expect(view.container).toBeEmptyDOMElement()
      else if (destination === '/') expect(screen.getByRole('heading', { name: '메인 화면' })).toBeInTheDocument()
      else {
        expect(screen.getByRole('textbox', { name: '답변' })).toHaveValue('')
        expect(screen.getByRole('textbox', { name: '답변' })).toBeEnabled()
        expect(screen.getByRole('button', { name: '답변 제출' })).toBeEnabled()
      }
    } finally { await drainPost(request.release, post.mock.results[0].value) }
  })
})
