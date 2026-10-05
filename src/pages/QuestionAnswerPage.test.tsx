import { StrictMode } from 'react'
import axios from 'axios'
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

  it('preserves the draft after an axios timeout without automatic resubmission', async () => {
    // MSW's synthetic XHR response does not model the browser timeout clock.
    // Inject only this transport error; all normal HTTP scenarios use MSW.
    renderQuestion()
    const { user, input, button } = await enterAnswer()
    const post = vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new axios.AxiosError('timeout', 'ECONNABORTED'))
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 평가와 저장이 완료됐을 수 있습니다')
    expect(input).toHaveValue(draft)
    expect(input).toBeEnabled()
    expect(button).toBeEnabled()
    expect(screen.queryByText('답변을 분석중입니다.')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each(['/','/questions/2'])('does not navigate from a late response after leaving for %s', async (destination) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const started = vi.fn()
    server.use(http.post(endpoint, async () => { started(); await gate; return HttpResponse.json(evaluation, { status: 201 }) }))
    renderQuestion()
    const { user, button } = await enterAnswer()
    try {
      await user.click(button)
      await waitFor(() => expect(started).toHaveBeenCalledTimes(1))
      await user.click(screen.getByRole('link', { name: destination === '/' ? '메인으로' : '다른 질문' }))
      if (destination === '/') expect(await screen.findByRole('heading', { name: '메인 화면' })).toBeInTheDocument()
      else expect(await screen.findByRole('textbox', { name: '답변' })).toHaveValue('')
      await act(async () => { release(); await gate })
      expect(screen.queryByRole('heading', { name: '평가 결과' })).not.toBeInTheDocument()
    } finally { release() }
  })
})
