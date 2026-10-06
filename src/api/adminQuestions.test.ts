import axios from 'axios'
import { http, HttpResponse } from 'msw'
import type { JsonBodyType } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import {
  createAdminQuestion,
  getAdminQuestion,
  getAdminQuestions,
  previewAdminQuestion,
  updateAdminQuestion,
} from './adminQuestions'
import { apiClient } from './client'
import { adminClient, clearAdminSession } from './auth'
import type { AdminQuestionDetail, AdminQuestionRequest, EvaluationPreviewRequest, EvaluationPreviewResult } from './types'

const endpoint = 'http://api.test/api/admin/questions'
const request: AdminQuestionRequest = {
  title: '  Question title  ',
  content: '  Original\nquestion content  ',
  criteria: [
    { content: '  Second criterion\n  ', maxScore: 40, displayOrder: 7 },
    { content: '  First criterion  ', maxScore: 60, displayOrder: 2 },
  ],
}
const detail: AdminQuestionDetail = {
  id: 3,
  title: request.title,
  content: request.content,
  criteria: [
    { id: 11, ...request.criteria[1] },
    { id: 12, ...request.criteria[0] },
  ],
}
const previewRequest: EvaluationPreviewRequest = { ...request, answer: '  Original\nanswer  ' }
const preview: EvaluationPreviewResult = {
  questionTitle: request.title,
  answer: previewRequest.answer,
  score: 65,
  result: 'RETRY',
  strengths: 'Explains the purpose.',
  weaknesses: 'Missing detail.',
  improvements: 'Explain the structure.',
}
const saveError = '서버에 질문이 저장됐을 수 있습니다'

beforeEach(() => {
  clearAdminSession()
  server.use(http.get('http://api.test/api/auth/csrf', () => HttpResponse.json({
    headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'question-token',
  })))
})

afterEach(() => clearAdminSession())

describe('admin question request contract', () => {
  it('preserves the existing list GET with its signal and no timeout', async () => {
    const get = vi.spyOn(adminClient, 'get')
    const controller = new AbortController()
    const summaries = [{ id: detail.id, title: detail.title }]
    server.use(http.get(endpoint, ({ request }) => {
      expect(request.credentials).toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      return HttpResponse.json(summaries)
    }))
    await expect(getAdminQuestions(controller.signal)).resolves.toEqual(summaries)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/admin/questions', { signal: controller.signal })
    expect(apiClient.defaults.timeout).toBe(0)
    expect(adminClient.defaults.timeout).toBe(0)
    expect(apiClient.defaults.withCredentials).not.toBe(true)
    expect(apiClient.defaults.headers.common['X-CSRF-TOKEN']).toBeUndefined()
  })

  it('gets validated detail with the caller signal and no timeout', async () => {
    const get = vi.spyOn(adminClient, 'get')
    const controller = new AbortController()
    server.use(http.get(`${endpoint}/3`, ({ request }) => {
      expect(request.method).toBe('GET')
      expect(request.body).toBeNull()
      expect(request.credentials).toBe('include')
      return HttpResponse.json(detail)
    }))
    await expect(getAdminQuestion(3, controller.signal)).resolves.toEqual(detail)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/admin/questions/3', { signal: controller.signal })
    expect(apiClient.defaults.timeout).toBe(0)
  })

  it('honors an aborted GET signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await getAdminQuestion(3, controller.signal).catch((error: unknown) => error)
    expect(axios.isCancel(error)).toBe(true)
  })

  it.each(['create', 'update'] as const)('sends the raw %s body without IDs or a test answer', async (operation) => {
    const method = operation === 'create' ? 'post' : 'put'
    const path = operation === 'create' ? endpoint : `${endpoint}/3`
    const spy = vi.spyOn(adminClient, method)
    let body: unknown
    server.use(http[method](path, async ({ request }) => {
      expect(request.method).toBe(method.toUpperCase())
      expect(request.credentials).toBe('include')
      expect(request.headers.get('X-CSRF-TOKEN')).toBe('question-token')
      body = await request.json()
      return HttpResponse.json(detail, { status: operation === 'create' ? 201 : 200 })
    }))
    const original = structuredClone(request)
    await expect(operation === 'create' ? createAdminQuestion(request) : updateAdminQuestion(3, request)).resolves.toEqual(detail)
    expect(body).toEqual(original)
    expect(request).toEqual(original)
    expect(spy).toHaveBeenCalledExactlyOnceWith(path.replace('http://api.test', ''), request, {
      headers: { 'X-CSRF-TOKEN': 'question-token' },
    })
    expect(apiClient.defaults.timeout).toBe(0)
  })

  it('sends the raw preview body and returns only the seven contracted fields', async () => {
    const post = vi.spyOn(adminClient, 'post')
    let body: unknown
    server.use(http.post(`${endpoint}/evaluation-preview`, async ({ request }) => {
      expect(request.credentials).toBe('include')
      expect(request.headers.get('X-CSRF-TOKEN')).toBe('question-token')
      body = await request.json()
      return HttpResponse.json(preview)
    }))
    const original = structuredClone(previewRequest)
    await expect(previewAdminQuestion(previewRequest)).resolves.toEqual(preview)
    expect(body).toEqual(original)
    expect(previewRequest).toEqual(original)
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/admin/questions/evaluation-preview', previewRequest, {
      headers: { 'X-CSRF-TOKEN': 'question-token' },
    })
    expect(Object.keys(preview)).toHaveLength(7)
    expect(apiClient.defaults.timeout).toBe(0)
  })

  it('does not validate the UI wait-time environment in any API function', async () => {
    vi.stubEnv('VITE_EVALUATION_TIMEOUT_MS', 'invalid')
    server.use(
      http.get(`${endpoint}/3`, () => HttpResponse.json(detail)),
      http.post(endpoint, () => HttpResponse.json(detail, { status: 201 })),
      http.put(`${endpoint}/3`, () => HttpResponse.json(detail)),
      http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json(preview)),
    )
    await expect(getAdminQuestion(3)).resolves.toEqual(detail)
    await expect(createAdminQuestion(request)).resolves.toEqual(detail)
    await expect(updateAdminQuestion(3, request)).resolves.toEqual(detail)
    await expect(previewAdminQuestion(previewRequest)).resolves.toEqual(preview)
  })
})

const invalidDetails: [string, JsonBodyType][] = [
  ['null', null], ['array', []], ['missing fields', {}],
  ...[0, -1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1].map((id): [string, JsonBodyType] => [`id ${id}`, { ...detail, id }]),
  ['missing title', { ...detail, title: undefined }], ['null title', { ...detail, title: null }],
  ['numeric content', { ...detail, content: 1 }], ['missing content', { ...detail, content: undefined }],
  ['null criteria', { ...detail, criteria: null }], ['object criteria', { ...detail, criteria: {} }],
  ['missing criteria', { ...detail, criteria: undefined }], ['null criterion', { ...detail, criteria: [null] }],
  ['array criterion', { ...detail, criteria: [[]] }],
  ...[0, -1, 1.5, '11', undefined, Number.MAX_SAFE_INTEGER + 1].map((id): [string, JsonBodyType] =>
    [`criterion id ${id}`, { ...detail, criteria: [{ ...detail.criteria[0], id }] }]),
  ['null criterion content', { ...detail, criteria: [{ ...detail.criteria[0], content: null }] }],
  ['missing criterion content', { ...detail, criteria: [{ ...detail.criteria[0], content: undefined }] }],
  ...['maxScore', 'displayOrder'].flatMap((field) => [undefined, null, '1', 1.5].map((value): [string, JsonBodyType] =>
    [`criterion ${field} ${value}`, { ...detail, criteria: [{ ...detail.criteria[0], [field]: value }] }])),
]

describe('admin question detail validation', () => {
  it('rejects a GET detail for a different question', async () => {
    server.use(http.get(`${endpoint}/3`, () => HttpResponse.json({ ...detail, id: 4 })))
    await expect(getAdminQuestion(3)).rejects.toThrow('질문 상세 응답')
  })

  it.each(invalidDetails)('rejects malformed GET detail: %s', async (_label, data) => {
    server.use(http.get(`${endpoint}/3`, () => HttpResponse.json(data)))
    await expect(getAdminQuestion(3)).rejects.toThrow('질문 상세 응답')
  })

  it.each(['create', 'update'] as const)('rejects malformed %s successes with a safe uncertain-save warning', async (operation) => {
    const method = operation === 'create' ? 'post' : 'put'
    const path = operation === 'create' ? endpoint : `${endpoint}/3`
    const spy = vi.spyOn(adminClient, method)
    for (const [, data] of invalidDetails) {
      server.use(http[method](path, () => HttpResponse.json(data, { status: operation === 'create' ? 201 : 200 })))
      await expect(operation === 'create' ? createAdminQuestion(request) : updateAdminQuestion(3, request)).rejects.toThrow(saveError)
    }
    expect(spy).toHaveBeenCalledTimes(invalidDetails.length)
  })

  it('rejects a PUT success for a different question without retrying', async () => {
    const put = vi.spyOn(adminClient, 'put')
    server.use(http.put(`${endpoint}/3`, () => HttpResponse.json({ ...detail, id: 4 })))
    await expect(updateAdminQuestion(3, request)).rejects.toThrow(saveError)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('accepts safe ID boundaries and stored integer display orders without rewriting them', async () => {
    const stored = { ...detail, id: Number.MAX_SAFE_INTEGER, criteria: [{ ...detail.criteria[0], id: Number.MAX_SAFE_INTEGER, displayOrder: -2 }] }
    server.use(http.get(`${endpoint}/${stored.id}`, () => HttpResponse.json(stored)))
    await expect(getAdminQuestion(stored.id)).resolves.toEqual(stored)
  })
})

describe('preview response validation', () => {
  it.each([
    ['null', null], ['array', []], ['missing fields', {}],
    ...['questionTitle', 'answer', 'strengths', 'weaknesses', 'improvements'].flatMap((field) =>
      [undefined, null, 1].map((value): [string, JsonBodyType] => [`${field} ${value}`, { ...preview, [field]: value }])),
    ...[-1, 101, 1.5, '65', null, undefined].map((score): [string, JsonBodyType] => [`score ${score}`, { ...preview, score }]),
    ...['PENDING', 'pass', null, undefined].map((result): [string, JsonBodyType] => [`result ${result}`, { ...preview, result }]),
  ])('rejects malformed preview: %s', async (_label, data) => {
    server.use(http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json(data)))
    await expect(previewAdminQuestion(previewRequest)).rejects.toThrow('평가 테스트 응답')
  })

  it.each([[0, 'FAIL'], [50, 'RETRY'], [100, 'PASS']] as const)('accepts score %s and verdict %s', async (score, result) => {
    const data = { ...preview, score, result }
    server.use(http.post(`${endpoint}/evaluation-preview`, () => HttpResponse.json(data)))
    await expect(previewAdminQuestion(previewRequest)).resolves.toEqual(data)
  })
})

const operations = [
  { name: 'detail', method: 'get', path: `${endpoint}/3`, status: 200, data: detail, run: () => getAdminQuestion(3), error: '질문 상세 응답', errors: [400, 401, 403, 404, 500] },
  { name: 'create', method: 'post', path: endpoint, status: 201, data: detail, run: () => createAdminQuestion(request), error: saveError, errors: [400, 401, 403, 413, 500] },
  { name: 'update', method: 'put', path: `${endpoint}/3`, status: 200, data: detail, run: () => updateAdminQuestion(3, request), error: saveError, errors: [400, 401, 403, 404, 413, 500] },
  { name: 'preview', method: 'post', path: `${endpoint}/evaluation-preview`, status: 200, data: preview, run: () => previewAdminQuestion(previewRequest), error: '평가 테스트 응답', errors: [400, 401, 403, 413, 502, 500] },
] as const

describe.each(operations)('$name status and transport errors', (operation) => {
  it.each([200, 201, 202, 204].filter((status) => status !== operation.status))('rejects unexpected successful status %s', async (status) => {
    server.use(http[operation.method](operation.path, () => status === 204
      ? new HttpResponse(null, { status }) : HttpResponse.json(operation.data, { status })))
    await expect(operation.run()).rejects.toThrow(operation.error)
  })

  it.each(operation.errors)('propagates HTTP %s without automatic retransmission', async (status) => {
    const spy = vi.spyOn(adminClient, operation.method)
    const data = { code: 'CONTRACT_ERROR', message: 'Safe server error.' }
    server.use(http[operation.method](operation.path, () => status === 413
      ? new HttpResponse('<html>Too large</html>', { status, headers: { 'Content-Type': 'text/html' } })
      : HttpResponse.json(data, { status })))
    await expect(operation.run()).rejects.toMatchObject({ response: { status, data: status === 413 ? '<html>Too large</html>' : data } })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('propagates network failure without automatic retransmission', async () => {
    const spy = vi.spyOn(adminClient, operation.method)
    server.use(http[operation.method](operation.path, () => HttpResponse.error()))
    await expect(operation.run()).rejects.toMatchObject({ isAxiosError: true })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('CSRF write prerequisites', () => {
  it.each(operations.filter((operation) => operation.method !== 'get'))('blocks $name when CSRF fails', async (operation) => {
    const spy = vi.spyOn(adminClient, operation.method)
    server.use(http.get('http://api.test/api/auth/csrf', () => HttpResponse.error()))
    await expect(operation.run()).rejects.toMatchObject({ isAxiosError: true })
    expect(spy).not.toHaveBeenCalled()
  })

  it('blocks a write if the session changes while its CSRF response is pending', async () => {
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.use(http.get('http://api.test/api/auth/csrf', async () => {
      entered()
      await gate
      return HttpResponse.json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'old' })
    }))
    const post = vi.spyOn(adminClient, 'post')
    const outcome = createAdminQuestion(request).catch((error: unknown) => error)
    await started
    clearAdminSession()
    release()
    expect(await outcome).toBeInstanceOf(Error)
    expect(post).not.toHaveBeenCalled()
  })
})
