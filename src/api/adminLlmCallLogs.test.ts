import axios from 'axios'
import { http, HttpResponse } from 'msw'
import type { JsonBodyType } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { getAdminLlmCallLog, getAdminLlmCallLogs } from './adminLlmCallLogs'
import { adminClient, clearAdminSession } from './auth'
import type { LlmCallLogDetail, LlmCallLogPage, LlmCallLogQuery, LlmCallLogSummary } from './types'

const endpoint = 'http://api.test/api/admin/llm-call-logs'
const query: LlmCallLogQuery = { page: 0, size: 20 }
const summary: LlmCallLogSummary = {
  id: 102,
  purpose: 'ANSWER_EVALUATION',
  status: 'SUCCEEDED',
  provider: 'gateway.example.test',
  requestedModel: 'fixture-model',
  responseModel: 'fixture-model-revision',
  startedAt: '2026-10-25T12:59:00Z',
  completedAt: '2026-10-25T12:59:02.500Z',
  durationMs: 2480,
  inputTokens: 1200,
  outputTokens: 300,
  totalTokens: 1500,
  failureStage: null,
}
const started: LlmCallLogSummary = {
  ...summary,
  id: 103,
  purpose: 'ADMIN_PREVIEW',
  status: 'STARTED',
  responseModel: null,
  completedAt: null,
  durationMs: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
}
const page: LlmCallLogPage = { items: [started, summary], page: 0, size: 20, totalElements: 2, totalPages: 1 }
const detail: LlmCallLogDetail = {
  ...summary,
  questionId: 1,
  evaluationAttemptId: 42,
  createdAt: '2026-10-25T12:59:00.005Z',
  responseId: 'fixture-response',
  finishReason: 'stop',
  cachedInputTokens: 200,
  reasoningTokens: 50,
  requestMessages: [
    { role: 'system', content: '  Evaluate the answer.\nPreserve this text.  ' },
    { role: 'user', content: '{"answer":"fixture answer"}' },
  ],
  requestOptions: { maxCompletionTokens: 2048, responseFormat: { type: 'json_schema', strict: true } },
  responseData: {
    results: [{ index: 0, text: '{"score":80}', finishReason: 'stop', metadata: {} }],
    metadata: {},
    usage: { promptTokens: 1200, completionTokens: 300, totalTokens: 1500 },
  },
  errorData: null,
}

beforeEach(() => clearAdminSession())
afterEach(() => clearAdminSession())

describe('admin LLM call log request contract', () => {
  it('sends all filters verbatim, including a positive timezone offset and model punctuation', async () => {
    const filters: LlmCallLogQuery = {
      page: 2,
      size: 50,
      startedFrom: '2026-10-25T00:00:00+09:00',
      startedTo: '2026-10-26T00:00:00+09:00',
      status: 'FAILED',
      purpose: 'ADMIN_PREVIEW',
      model: 'vendor/model+revision & special',
    }
    const original = structuredClone(filters)
    const response = { ...page, items: [], page: 2, size: 50 }
    const controller = new AbortController()
    const get = vi.spyOn(adminClient, 'get')
    server.use(http.get(endpoint, ({ request }) => {
      expect(request.method).toBe('GET')
      expect(request.body).toBeNull()
      expect(request.credentials).toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
        ...filters, page: '2', size: '50',
      })
      return HttpResponse.json(response)
    }))

    await expect(getAdminLlmCallLogs(filters, controller.signal)).resolves.toEqual(response)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/admin/llm-call-logs', { params: filters, signal: controller.signal })
    expect(filters).toEqual(original)
    expect(adminClient.defaults.timeout).toBe(0)
  })

  it.each([query, {
    ...query, startedFrom: undefined, startedTo: undefined, status: undefined, purpose: undefined, model: undefined,
  }])('omits unused filters and does not add sorting or auth requests: %j', async (filters) => {
    const get = vi.spyOn(adminClient, 'get')
    server.use(http.get(endpoint, ({ request }) => {
      expect([...new URL(request.url).searchParams.entries()]).toEqual([['page', '0'], ['size', '20']])
      expect(request.credentials).toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      return HttpResponse.json(page)
    }))

    await expect(getAdminLlmCallLogs(filters)).resolves.toEqual(page)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('gets the requested detail with credentials, no body or CSRF, and the caller signal', async () => {
    const controller = new AbortController()
    const get = vi.spyOn(adminClient, 'get')
    server.use(http.get(`${endpoint}/102`, ({ request }) => {
      expect(request.method).toBe('GET')
      expect(new URL(request.url).search).toBe('')
      expect(request.body).toBeNull()
      expect(request.credentials).toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      return HttpResponse.json(detail)
    }))

    await expect(getAdminLlmCallLog(102, controller.signal)).resolves.toEqual(detail)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/admin/llm-call-logs/102', { signal: controller.signal })
    expect(adminClient.defaults.timeout).toBe(0)
  })
})

describe('admin LLM call log valid responses', () => {
  it.each([
    ['empty first page', { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }],
    ['out-of-range page', { items: [], page: 5, size: 20, totalElements: 2, totalPages: 1 }],
  ])('accepts an %s without replacing its pagination', async (_label, data) => {
    server.use(http.get(endpoint, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLogs({ page: data.page, size: data.size })).resolves.toEqual(data)
  })

  it('preserves null versus zero and never calculates a missing total', async () => {
    const data = {
      ...page,
      items: [started, { ...summary, durationMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: null }],
    }
    server.use(http.get(endpoint, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLogs(query)).resolves.toEqual(data)
  })

  it.each([
    ['started preview', {
      ...detail, ...started, questionId: null, evaluationAttemptId: null, responseId: null, finishReason: null,
      cachedInputTokens: null, reasoningTokens: null, responseData: null,
    }],
    ['successful zero usage', {
      ...detail, durationMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
    }],
    ['successful missing usage', {
      ...detail, inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null,
      evaluationAttemptId: null, responseData: { ...detail.responseData!, usage: null },
    }],
    ['model failure without a response', {
      ...detail, status: 'FAILED', failureStage: 'MODEL_CALL', responseModel: null,
      evaluationAttemptId: null, responseId: null, finishReason: null, inputTokens: null, outputTokens: null,
      totalTokens: null, cachedInputTokens: null, reasoningTokens: null, responseData: null,
      errorData: { type: 'ModelException', message: null, causes: [{ type: 'TransportException', message: null }] },
    }],
    ['parse failure with raw response and tokens', {
      ...detail, status: 'FAILED', failureStage: 'RESPONSE_PARSE', evaluationAttemptId: null,
      responseData: { ...detail.responseData!, results: [{ index: 0, text: 'not JSON <script>fixture</script>', finishReason: null, metadata: {} }] },
      errorData: { type: 'ParseException', message: 'Invalid fixture JSON', causes: [] },
    }],
    ['empty response failure', {
      ...detail, status: 'FAILED', failureStage: 'EMPTY_RESPONSE',
      responseData: { results: [], metadata: {}, usage: null },
      errorData: { type: 'EmptyResponseException', message: 'No result', causes: [] },
    }],
    ['safe ID boundary', { ...detail, id: Number.MAX_SAFE_INTEGER, questionId: Number.MAX_SAFE_INTEGER, evaluationAttemptId: Number.MAX_SAFE_INTEGER }],
  ] satisfies [string, LlmCallLogDetail][])('accepts %s without normalizing stored data', async (_label, data) => {
    server.use(http.get(`${endpoint}/${data.id}`, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLog(data.id)).resolves.toEqual(data)
  })

  it('accepts arbitrary providers and nested JSON metadata instead of hardcoding vendor keys', async () => {
    const metadata = { vendorSpecific: { values: [null, false, 0, 'raw', { nested: ['value', true] }] } }
    const data: LlmCallLogDetail = {
      ...detail,
      provider: 'new-provider.example.test',
      requestOptions: { ...metadata, arbitraryOption: 0.25 },
      responseData: {
        results: [
          { index: 0, text: '  Original\nresponse  ', finishReason: 'vendor_reason', metadata },
          { index: 1, text: null, finishReason: null, metadata: {} },
        ],
        metadata,
        usage: { ...metadata, providerTokenDetails: { cache: 0, unavailable: null } },
      },
    }
    server.use(http.get(`${endpoint}/102`, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLog(102)).resolves.toEqual(data)
  })
})

const invalidSummaries: [string, JsonBodyType][] = [
  ['null item', null], ['array item', []], ['empty item', {}],
  ...Object.keys(summary).map((field): [string, JsonBodyType] => [`missing ${field}`, { ...summary, [field]: undefined }]),
  ...[0, -1, 1.5, '102', null, Number.MAX_SAFE_INTEGER + 1].map((id): [string, JsonBodyType] => [`id ${id}`, { ...summary, id }]),
  ...['provider', 'requestedModel'].flatMap((field) => [null, 1].map((value): [string, JsonBodyType] =>
    [`${field} ${value}`, { ...summary, [field]: value }])),
  ['invalid purpose', { ...summary, purpose: 'PREVIEW' }], ['invalid status', { ...summary, status: 'PENDING' }],
  ['lowercase status', { ...summary, status: 'succeeded' }], ['invalid response model', { ...summary, responseModel: 1 }],
  ['invalid failure stage', { ...summary, failureStage: 'VALIDATION' }],
  ['completed status missing completion', { ...summary, completedAt: null }],
  ['completed status missing duration', { ...summary, durationMs: null }],
  ['successful status with failure stage', { ...summary, failureStage: 'MODEL_CALL' }],
  ['failed status missing failure stage', { ...summary, status: 'FAILED' }],
  ['started status with completion', { ...started, completedAt: summary.completedAt }],
  ['started status with tokens', { ...started, inputTokens: 0 }],
  ...['startedAt', 'completedAt'].flatMap((field) => ['invalid', '2026-10-25T12:59:00', 123].map((value): [string, JsonBodyType] =>
    [`${field} ${value}`, { ...summary, [field]: value }])),
  ['null startedAt', { ...summary, startedAt: null }],
  ...['durationMs', 'inputTokens', 'outputTokens', 'totalTokens'].flatMap((field) => [-1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1].map((value): [string, JsonBodyType] =>
    [`${field} ${value}`, { ...summary, [field]: value }])),
]

describe('admin LLM call log page validation', () => {
  it.each([
    ['null', null], ['array', []], ['empty object', {}],
    ...Object.keys(page).map((field): [string, JsonBodyType] => [`missing ${field}`, { ...page, [field]: undefined }]),
    ['null items', { ...page, items: null }], ['object items', { ...page, items: {} }],
    ['mismatched page', { ...page, page: 1 }], ['mismatched size', { ...page, size: 10 }],
    ['string page', { ...page, page: '0' }], ['string size', { ...page, size: '20' }],
    ...['totalElements', 'totalPages'].flatMap((field) => [null, -1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1].map((value): [string, JsonBodyType] =>
      [`${field} ${value}`, { ...page, [field]: value }])),
  ] satisfies [string, JsonBodyType][])('rejects malformed page: %s', async (_label, data) => {
    server.use(http.get(endpoint, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLogs(query)).rejects.toThrow('Invalid LLM call log page response')
  })

  it.each(invalidSummaries)('rejects malformed summary: %s', async (_label, item) => {
    server.use(http.get(endpoint, () => HttpResponse.json({ ...page, items: [summary, item] })))
    await expect(getAdminLlmCallLogs(query)).rejects.toThrow('Invalid LLM call log page response')
  })
})

const invalidDetails: [string, JsonBodyType][] = [
  ['null', null], ['array', []], ['empty object', {}],
  ...Object.keys(detail).map((field): [string, JsonBodyType] => [`missing ${field}`, { ...detail, [field]: undefined }]),
  ...invalidSummaries.flatMap(([label, item]): [string, JsonBodyType][] =>
    typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length > 0
      ? [[`summary ${label}`, { ...detail, ...item }]] : []),
  ['mismatched ID', { ...detail, id: 103 }],
  ['successful status with an error', { ...detail, errorData: { type: 'Error', message: null, causes: [] } }],
  ['failed status missing error', { ...detail, status: 'FAILED', failureStage: 'MODEL_CALL' }],
  ...['questionId', 'evaluationAttemptId'].flatMap((field) => [0, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1].map((value): [string, JsonBodyType] =>
    [`${field} ${value}`, { ...detail, [field]: value }])),
  ...['responseId', 'finishReason'].map((field): [string, JsonBodyType] => [`numeric ${field}`, { ...detail, [field]: 1 }]),
  ...['cachedInputTokens', 'reasoningTokens'].flatMap((field) => [-1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1].map((value): [string, JsonBodyType] =>
    [`${field} ${value}`, { ...detail, [field]: value }])),
  ['invalid createdAt', { ...detail, createdAt: 'invalid' }], ['null createdAt', { ...detail, createdAt: null }],
  ['timezone-free createdAt', { ...detail, createdAt: '2026-10-25T12:59:00' }],
  ...[null, {}, '[]', [null], [[]], [{ role: 'user' }], [{ content: 'text' }], [{ role: 1, content: 'text' }], [{ role: 'user', content: null }]]
    .map((requestMessages): [string, JsonBodyType] => [`messages ${JSON.stringify(requestMessages)}`, { ...detail, requestMessages }]),
  ...[null, [], '{}'].map((requestOptions): [string, JsonBodyType] => [`options ${JSON.stringify(requestOptions)}`, { ...detail, requestOptions }]),
  ...[[], '{}', {}, { results: [], metadata: {} }, { results: [], usage: null }, { metadata: {}, usage: null },
    { results: null, metadata: {}, usage: null }, { results: [], metadata: [], usage: null }, { results: [], metadata: {}, usage: [] },
    { results: [], metadata: {}, usage: 'raw' },
  ].map((responseData): [string, JsonBodyType] => [`response ${JSON.stringify(responseData)}`, { ...detail, responseData }]),
  ...[null, [], {}, { index: 0, text: null, finishReason: null }, { index: -1, text: null, finishReason: null, metadata: {} },
    { index: 0.5, text: null, finishReason: null, metadata: {} }, { index: 0, finishReason: null, metadata: {} },
    { index: 0, text: null, metadata: {} }, { index: 0, text: 1, finishReason: null, metadata: {} },
    { index: 0, text: null, finishReason: 1, metadata: {} }, { index: 0, text: null, finishReason: null, metadata: [] },
  ].map((result): [string, JsonBodyType] => [`result ${JSON.stringify(result)}`, { ...detail, responseData: { results: [result], metadata: {}, usage: null } }]),
  ...[[], '{}', {}, { message: null, causes: [] }, { type: 'Error', causes: [] }, { type: 'Error', message: null },
    { type: 1, message: null, causes: [] }, { type: 'Error', message: 1, causes: [] }, { type: 'Error', message: null, causes: {} },
    ...[null, [], {}, { type: 'Cause' }, { message: null }, { type: 1, message: null }, { type: 'Cause', message: 1 }]
      .map((cause) => ({ type: 'Error', message: null, causes: [cause] })),
  ].map((errorData): [string, JsonBodyType] => [`error ${JSON.stringify(errorData)}`, { ...detail, errorData }]),
]

describe('admin LLM call log detail validation', () => {
  it.each(invalidDetails)('rejects malformed detail: %s', async (_label, data) => {
    server.use(http.get(`${endpoint}/102`, () => HttpResponse.json(data)))
    await expect(getAdminLlmCallLog(102)).rejects.toThrow('Invalid LLM call log detail response')
  })
})

const operations = [
  { name: 'page', path: endpoint, data: page, run: (signal?: AbortSignal) => getAdminLlmCallLogs(query, signal), error: 'Invalid LLM call log page response' },
  { name: 'detail', path: `${endpoint}/102`, data: detail, run: (signal?: AbortSignal) => getAdminLlmCallLog(102, signal), error: 'Invalid LLM call log detail response' },
] as const

describe.each(operations)('admin LLM call log $name errors and cancellation', (operation) => {
  it.each([201, 202, 204])('rejects unexpected success status %s', async (status) => {
    server.use(http.get(operation.path, () => status === 204
      ? new HttpResponse(null, { status }) : HttpResponse.json(operation.data, { status })))
    await expect(operation.run()).rejects.toThrow(operation.error)
  })

  it.each([
    [400, 'INVALID_REQUEST'], [401, 'AUTHENTICATION_REQUIRED'], [403, 'ACCESS_DENIED'],
    [404, 'LLM_CALL_LOG_NOT_FOUND'], [500, 'INTERNAL_SERVER_ERROR'],
  ] as const)('propagates HTTP %s and the server error without retrying', async (status, code) => {
    const get = vi.spyOn(adminClient, 'get')
    const data = { code, message: 'Safe fixture error.' }
    server.use(http.get(operation.path, () => HttpResponse.json(data, { status })))
    await expect(operation.run()).rejects.toMatchObject({ isAxiosError: true, response: { status, data } })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('propagates non-JSON infrastructure errors without turning them into a validation error', async () => {
    server.use(http.get(operation.path, () => new HttpResponse('Unavailable', { status: 503 })))
    await expect(operation.run()).rejects.toMatchObject({ response: { status: 503, data: 'Unavailable' } })
  })

  it('propagates network errors without retrying', async () => {
    const get = vi.spyOn(adminClient, 'get')
    server.use(http.get(operation.path, () => HttpResponse.error()))
    await expect(operation.run()).rejects.toMatchObject({ isAxiosError: true })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('honors a signal that is already aborted without dispatching HTTP', async () => {
    const handler = vi.fn(() => HttpResponse.json(operation.data))
    server.use(http.get(operation.path, handler))
    const controller = new AbortController()
    controller.abort()
    const error: unknown = await operation.run(controller.signal).catch((error: unknown) => error)
    expect(axios.isCancel(error)).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })

  it('cancels an in-flight request instead of accepting its later success', async () => {
    let entered!: () => void
    let release!: () => void
    const received = new Promise<void>((resolve) => { entered = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    const handler = vi.fn(async () => {
      entered()
      await gate
      return HttpResponse.json(operation.data)
    })
    server.use(http.get(operation.path, handler))
    const controller = new AbortController()
    const outcome = operation.run(controller.signal).catch((error: unknown) => error)
    try {
      await received
      controller.abort()
      expect(axios.isCancel(await outcome)).toBe(true)
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
  })
})
