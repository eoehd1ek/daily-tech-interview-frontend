import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router'
import { expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient } from '../api/client'
import type { QuestionSummary } from '../api/types'
import HomePage from './HomePage'

const endpoint = 'http://api.test/api/questions'
const questions: QuestionSummary[] = [{ id: 9, title: '인덱스', categories: [] }, { id: 2, title: 'Java GC', categories: [] }]
const categorizedQuestions: QuestionSummary[] = [
  { id: 1, title: '분류 없는 질문', categories: [] },
  { id: 2, title: '렌더링 질문', categories: ['FRONTEND'] },
  { id: 3, title: '서버 질문', categories: ['BACKEND'] },
  { id: 4, title: 'HTTP 질문', categories: ['FRONTEND', 'BACKEND'] },
]

function SelectedQuestion() {
  const { questionId } = useParams()
  return <h1>선택한 질문 {questionId}</h1>
}

function renderHome() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <Link to="/other">다른 화면</Link>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/questions/:questionId" element={<SelectedQuestion />} />
          <Route path="/other" element={<><h1>다른 화면</h1><Link to="/">질문 목록으로</Link></>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

it('shows the introduction and loading until the list response arrives', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.get(endpoint, async () => { await gate; return HttpResponse.json(questions) }))
  renderHome()
  try {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('피드백으로 성장하세요')
    expect(screen.getByText(/AI 평가로 잘 설명한 부분/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('질문 목록을 불러오는 중입니다.')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  } finally { release() }
  expect(await screen.findByRole('list', { name: '질문 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('keeps response order and supports keyboard selection of the question URL', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json(questions)))
  renderHome()
  const list = await screen.findByRole('list', { name: '질문 목록' })
  const links = within(list).getAllByRole('link')
  expect(links[0]).toHaveAccessibleName('인덱스')
  expect(links[1]).toHaveAccessibleName('Java GC')
  expect(links[0]).toHaveAttribute('href', '/questions/9')
  expect(links[1]).toHaveAttribute('href', '/questions/2')
  const user = userEvent.setup()
  await user.tab() // The test shell's navigation link precedes the question links.
  await user.tab()
  expect(screen.getByRole('combobox', { name: '질문 카테고리' })).toHaveFocus()
  await user.tab()
  expect(links[0]).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('heading', { name: '선택한 질문 9' })).toBeInTheDocument()
})

it('shows an empty list as a normal state rather than an error', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json([])))
  renderHome()
  expect(await screen.findByText('아직 등록된 질문이 없습니다.')).toHaveAttribute('role', 'status')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
  await user.click(screen.getByRole('option', { name: '백엔드' }))
  expect(screen.getByRole('status')).toHaveTextContent('아직 등록된 질문이 없습니다.')
  expect(screen.queryByText('선택한 카테고리에 해당하는 질문이 없습니다.')).not.toBeInTheDocument()
})

it('filters unclassified, single and dual categories locally with matching counts and title-only link names', async () => {
  const get = vi.spyOn(apiClient, 'get')
  server.use(http.get(endpoint, () => HttpResponse.json(categorizedQuestions)))
  renderHome()
  const list = await screen.findByRole('list', { name: '질문 목록' })
  expect(within(list).getAllByRole('link')).toHaveLength(4)
  expect(screen.getByText('4개 질문')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '질문 카테고리' })).toHaveTextContent('전체')
  const unclassified = within(list).getByRole('link', { name: '분류 없는 질문' })
  expect(within(unclassified).queryByText('프론트엔드')).not.toBeInTheDocument()
  expect(within(unclassified).queryByText('백엔드')).not.toBeInTheDocument()
  expect(within(list).queryByText('미분류')).not.toBeInTheDocument()
  const frontend = within(list).getByRole('link', { name: '렌더링 질문' })
  expect(within(frontend).getByText('프론트엔드')).toBeInTheDocument()
  expect(within(frontend).queryByText('백엔드')).not.toBeInTheDocument()
  const backend = within(list).getByRole('link', { name: '서버 질문' })
  expect(within(backend).getByText('백엔드')).toBeInTheDocument()
  const dual = within(list).getByRole('link', { name: 'HTTP 질문' })
  expect(within(dual).getByText('프론트엔드')).toBeInTheDocument()
  expect(within(dual).getByText('백엔드')).toBeInTheDocument()
  expect(dual).toHaveAccessibleName('HTTP 질문')
  const before = get.mock.calls.length
  const user = userEvent.setup()
  for (const [label, titles] of [
    ['프론트엔드', ['렌더링 질문', 'HTTP 질문']],
    ['백엔드', ['서버 질문', 'HTTP 질문']],
    ['전체', categorizedQuestions.map((question) => question.title)],
  ] as const) {
    await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
    await user.click(screen.getByRole('option', { name: label }))
    const links = within(screen.getByRole('list', { name: '질문 목록' })).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(titles)
    expect(screen.getByText(`${titles.length}개 질문`)).toBeInTheDocument()
  }
  expect(get).toHaveBeenCalledTimes(before)
})

it('distinguishes filtered-empty from global empty without fetching on filter changes', async () => {
  const get = vi.spyOn(apiClient, 'get')
  server.use(http.get(endpoint, () => HttpResponse.json(questions)))
  renderHome()
  await screen.findByRole('list', { name: '질문 목록' })
  const before = get.mock.calls.length
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
  await user.click(screen.getByRole('option', { name: '프론트엔드' }))
  expect(screen.getByRole('status')).toHaveTextContent('선택한 카테고리에 해당하는 질문이 없습니다.')
  expect(screen.getByText('0개 질문')).toBeInTheDocument()
  expect(screen.queryByText('아직 등록된 질문이 없습니다.')).not.toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledTimes(before)
})

it('resets the category to all after leaving and returning or remounting the page', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json(categorizedQuestions)))
  const view = renderHome()
  await screen.findByRole('list', { name: '질문 목록' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
  await user.click(screen.getByRole('option', { name: '백엔드' }))
  await user.click(screen.getByRole('link', { name: '다른 화면' }))
  await user.click(screen.getByRole('link', { name: '질문 목록으로' }))
  expect(await screen.findByRole('link', { name: '분류 없는 질문' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '질문 카테고리' })).toHaveTextContent('전체')
  await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
  await user.click(screen.getByRole('option', { name: '프론트엔드' }))
  view.unmount()
  renderHome()
  expect(await screen.findByRole('link', { name: '분류 없는 질문' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '질문 카테고리' })).toHaveTextContent('전체')
  expect(screen.getByText('4개 질문')).toBeInTheDocument()
})

it.each([
  { id: 1, title: '누락된 분류' },
  { id: 1, title: '알 수 없는 분류', categories: ['COMMON'] },
])('rejects an invalid category response instead of displaying it: $title', async (question) => {
  server.use(http.get(endpoint, () => HttpResponse.json([question])))
  renderHome()
  expect(await screen.findByRole('alert')).toHaveTextContent('연결 상태')
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: question.title })).not.toBeInTheDocument()
})

it.each(['server', 'network'])('recovers from %s failure through manual GET retry', async (failure) => {
  const received = vi.fn()
  server.use(http.get(endpoint, () => {
    received()
    return failure === 'server'
      ? HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '서버 목록 오류' }, { status: 500 })
      : HttpResponse.error()
  }))
  renderHome()
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'server' ? '서버 목록 오류' : '연결 상태')
  const before = received.mock.calls.length // StrictMode can start and cancel an initial GET.
  server.use(http.get(endpoint, () => { received(); return HttpResponse.json(questions) }))
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('link', { name: '인덱스' })).toBeInTheDocument()
  expect(received).toHaveBeenCalledTimes(before + 1)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('cancels a pending list request on leaving without showing a late error', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const get = vi.spyOn(apiClient, 'get')
  const started = vi.fn()
  server.use(http.get(endpoint, async () => {
    started()
    await gate
    return HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '늦은 목록 오류' }, { status: 500 })
  }))
  renderHome()
  try {
    await waitFor(() => expect(started).toHaveBeenCalled())
    const signals = get.mock.calls.map(([, config]) => config?.signal)
    expect(signals.some((signal) => signal && !signal.aborted)).toBe(true)
    await userEvent.setup().click(screen.getByRole('link', { name: '다른 화면' }))
    expect(await screen.findByRole('heading', { name: '다른 화면' })).toBeInTheDocument()
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    await act(async () => { release(); await gate })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  } finally { release() }
})
