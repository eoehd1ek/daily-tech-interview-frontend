import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient } from './client'
import { getQuestion, getQuestions } from './questions'
import { getAdminQuestions } from './adminQuestions'
import { isQuestionCategories } from './questionCategories'

const origin = 'http://api.test'
const question = { id: 1, title: 'React와 서버', content: '설명해주세요.', categories: ['FRONTEND', 'BACKEND'] }

it('reads required empty, single and multiple category arrays without category query parameters', async () => {
  const data = [
    { id: 3, title: '미분류', categories: [] },
    { id: 1, title: question.title, categories: question.categories },
    { id: 2, title: '서버', categories: ['BACKEND'] },
  ]
  const controller = new AbortController()
  const get = vi.spyOn(apiClient, 'get')
  server.use(http.get(`${origin}/api/questions`, ({ request }) => {
    expect(new URL(request.url).search).toBe('')
    expect(request.credentials).not.toBe('include')
    return HttpResponse.json(data)
  }))
  await expect(getQuestions(controller.signal)).resolves.toEqual(data)
  expect(get).toHaveBeenCalledExactlyOnceWith('/api/questions', { signal: controller.signal })
})

it('gets categories from a direct public detail GET without relying on a list', async () => {
  server.use(http.get(`${origin}/api/questions/1`, () => HttpResponse.json(question)))
  await expect(getQuestion(1)).resolves.toEqual(question)
})

const invalidCategories = [undefined, null, {}, 'BACKEND', [null], [1], ['COMMON'], ['frontend'],
  [' FRONTEND '], ['FRONTEND', 'FRONTEND'], Array(6).fill('BACKEND')]

it.each(invalidCategories.map((categories) => [JSON.stringify(categories), categories] as const))(
  'rejects malformed categories %s across public list/detail and admin list', async (_label, categories) => {
    expect(isQuestionCategories(categories)).toBe(false)
    const data = { ...question, categories }
    server.use(
      http.get(`${origin}/api/questions`, () => HttpResponse.json([data])),
      http.get(`${origin}/api/questions/1`, () => HttpResponse.json(data)),
      http.get(`${origin}/api/admin/questions`, () => HttpResponse.json([data])),
    )
    await expect(getQuestions()).rejects.toThrow('질문 목록 응답')
    await expect(getQuestion(1)).rejects.toThrow('질문 상세 응답')
    await expect(getAdminQuestions()).rejects.toThrow('질문 목록 응답')
  },
)

it('rejects wrong detail IDs and malformed list entries instead of silently hiding questions', async () => {
  server.use(
    http.get(`${origin}/api/questions/1`, () => HttpResponse.json({ ...question, id: 2 })),
    http.get(`${origin}/api/questions`, () => HttpResponse.json([null])),
  )
  await expect(getQuestion(1)).rejects.toThrow('질문 상세 응답')
  await expect(getQuestions()).rejects.toThrow('질문 목록 응답')
})

it('keeps anonymous requests abortable and propagates HTTP errors without retry', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(getQuestions(controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await expect(getQuestion(1, controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  const received = vi.fn()
  server.use(http.get(`${origin}/api/questions`, () => {
    received()
    return HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR', message: '조회 오류' }, { status: 500 })
  }))
  await expect(getQuestions()).rejects.toMatchObject({ response: { status: 500 } })
  expect(received).toHaveBeenCalledTimes(1)
})
