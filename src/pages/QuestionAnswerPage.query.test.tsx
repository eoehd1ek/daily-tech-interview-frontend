import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient } from '../api/client'
import QuestionAnswerPage from './QuestionAnswerPage'

const endpoint = 'http://api.test/api/questions/:questionId'
const question = { id: 1, title: '인덱스', content: '첫 줄\n둘째 줄 <script>text only</script>' }

function renderQuestion(id = '1') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/questions/${id}`]}>
        <Link to="/questions/2">다른 질문</Link>
        <Routes><Route path="/questions/:questionId" element={<QuestionAnswerPage />} /></Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

it.each(['0', '-1', '1abc', '1.5', '1e2', '9007199254740992'])(
  'rejects invalid question ID %s without a GET', (id) => {
    const received = vi.fn()
    server.use(http.get(endpoint, () => { received(); return HttpResponse.json(question) }))
    renderQuestion(id)
    expect(screen.getByRole('alert')).toHaveTextContent('잘못된 질문 ID')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(received).not.toHaveBeenCalled()
  },
)

it('accepts the safe-integer upper bound and uses that exact request ID', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ params }) => {
    received(params.questionId)
    return HttpResponse.json({ ...question, id: Number(params.questionId) })
  }))
  renderQuestion('9007199254740991')
  expect(await screen.findByRole('textbox', { name: '답변' })).toBeInTheDocument()
  expect(received).toHaveBeenCalledWith('9007199254740991')
})

it('shows loading, then displays the question as text and an accessible answer field', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get(endpoint, async () => { await gate; return HttpResponse.json(question) }))
  const { container } = renderQuestion()
  try {
    expect(screen.getByRole('status')).toHaveTextContent('질문을 불러오는 중입니다.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  } finally { release() }
  const input = await screen.findByRole('textbox', { name: '답변' })
  expect(screen.getByRole('heading', { name: '인덱스', level: 1 })).toBeInTheDocument()
  const content = screen.getByText(/첫 줄/)
  expect(content.textContent).toBe(question.content)
  expect(content).toHaveStyle({ whiteSpace: 'pre-wrap' })
  expect(container.querySelector('script')).toBeNull()
  expect(input).toHaveAttribute('maxlength', '3000')
  expect(input).toHaveValue('')
})

it.each([
  [400, 'INVALID_REQUEST', '잘못된 질문 조회 요청', false],
  [404, 'QUESTION_NOT_FOUND', '질문을 찾을 수 없습니다', false],
  [500, 'INTERNAL_SERVER_ERROR', '검증 서버 오류', true],
])('handles question lookup HTTP %s', async (status, code, message, canRetry) => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code, message: '검증 서버 오류' }, { status })))
  renderQuestion()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  if (canRetry) expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  else expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
})

it.each(['server', 'network'])('recovers from %s lookup error by manual retry', async (failure) => {
  server.use(http.get(endpoint, () => failure === 'server'
    ? HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '조회 실패' }, { status: 500 })
    : HttpResponse.error(),
  ))
  renderQuestion()
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'server' ? '조회 실패' : '연결 상태')
  server.use(http.get(endpoint, () => HttpResponse.json(question)))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('textbox', { name: '답변' })).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('preserves typed whitespace and newlines without repeating GET, and resets validation on question change', async () => {
  const received = vi.fn()
  server.use(http.get(endpoint, ({ params }) => {
    received(params.questionId)
    return HttpResponse.json({ ...question, id: Number(params.questionId), title: `질문 ${params.questionId}` })
  }))
  renderQuestion()
  const input = await screen.findByRole('textbox', { name: '답변' })
  const before = received.mock.calls.length
  const user = userEvent.setup()
  await user.type(input, '  답변\n원문  ')
  expect(input).toHaveValue('  답변\n원문  ')
  expect(received).toHaveBeenCalledTimes(before)
  await user.clear(input)
  await user.type(input, '   ')
  await user.tab()
  expect(input).toHaveAttribute('aria-invalid', 'true')
  await user.click(screen.getByRole('link', { name: '다른 질문' }))
  expect(await screen.findByRole('heading', { name: '질문 2' })).toBeInTheDocument()
  const nextInput = screen.getByRole('textbox', { name: '답변' })
  expect(nextInput).toHaveValue('')
  expect(nextInput).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByText(/공백이 아닌 답변/)).not.toBeInTheDocument()
})

it('limits user input to 3000 characters and displays the count', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json(question)))
  renderQuestion()
  const input = await screen.findByRole('textbox', { name: '답변' })
  const user = userEvent.setup()
  await user.click(input)
  await user.paste('가'.repeat(3001))
  expect(input).toHaveValue('가'.repeat(3000))
  expect(screen.getByText('3,000 / 3,000자')).toBeInTheDocument()
  await user.type(input, '나')
  expect(input).toHaveValue('가'.repeat(3000))
})

it('cancels the old lookup and ignores its response after changing question ID', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(apiClient, 'get')
  const started = vi.fn()
  server.use(http.get(endpoint, async ({ params }) => {
    if (params.questionId === '1') {
      started()
      await gate
      return HttpResponse.json({ ...question, title: '이전 질문' })
    }
    return HttpResponse.json({ ...question, id: 2, title: '새 질문' })
  }))
  renderQuestion()
  try {
    await waitFor(() => expect(started).toHaveBeenCalled())
    const signals = get.mock.calls.filter(([url]) => url === '/api/questions/1').map(([, config]) => config?.signal)
    expect(signals.some((signal) => signal && !signal.aborted)).toBe(true)
    await userEvent.setup().click(screen.getByRole('link', { name: '다른 질문' }))
    expect(await screen.findByRole('heading', { name: '새 질문' })).toBeInTheDocument()
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => { release(); await gate })
    expect(screen.getByRole('heading', { name: '새 질문' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이전 질문' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  } finally { release() }
})
