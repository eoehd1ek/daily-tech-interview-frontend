import axios from 'axios'
import { http, HttpResponse } from 'msw'
import type { JsonBodyType } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import {
  adminClient,
  clearAdminSession,
  getCsrfToken,
  getCurrentAdmin,
  loginAdmin,
  logoutAdmin,
  subscribeAdminSessionExpired,
} from './auth'
import { apiClient } from './client'

const endpoint = 'http://api.test/api/auth'
const user = { id: 1, loginId: 'admin', role: 'ADMIN' }
const credentials = { loginId: '  admin  ', password: '  private password  ' }
const csrf = { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'session-token' }
let csrfCalls = 0
const unsubscribe: (() => void)[] = []

beforeEach(() => {
  clearAdminSession()
  csrfCalls = 0
  server.use(http.get(`${endpoint}/csrf`, ({ request }) => {
    csrfCalls += 1
    expect(request.credentials).toBe('include')
    expect(request.headers.get('Accept')).toBe('application/json')
    expect(request.body).toBeNull()
    return HttpResponse.json(csrf)
  }))
})

afterEach(() => {
  clearAdminSession()
  for (const stop of unsubscribe.splice(0)) stop()
})

function listen() {
  const listener = vi.fn()
  unsubscribe.push(subscribeAdminSessionExpired(listener))
  return listener
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('isolated admin session requests', () => {
  it('keeps public credentials, CSRF and interceptors unchanged', async () => {
    const listener = listen()
    expect(adminClient).not.toBe(apiClient)
    expect(adminClient.defaults.baseURL).toBe(apiClient.defaults.baseURL)
    expect(adminClient.defaults.withCredentials).toBe(true)
    expect(apiClient.defaults.withCredentials).not.toBe(true)
    expect(apiClient.defaults.headers.common['X-CSRF-TOKEN']).toBeUndefined()
    server.use(http.get('http://api.test/api/questions', ({ request }) => {
      expect(request.credentials).not.toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      return HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: 'Login required.' }, { status: 401 })
    }))
    await getCsrfToken()
    await expect(apiClient.get('/api/questions')).rejects.toMatchObject({ response: { status: 401 } })
    await getCsrfToken()
    expect(csrfCalls).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it.each(['ADMIN', 'USER', ''])('gets a validated user without filtering role %s', async (role) => {
    const get = vi.spyOn(adminClient, 'get')
    const controller = new AbortController()
    const data = { ...user, role }
    server.use(http.get(`${endpoint}/me`, ({ request }) => {
      expect(request.credentials).toBe('include')
      expect(request.headers.has('X-CSRF-TOKEN')).toBe(false)
      return HttpResponse.json(data)
    }))
    await expect(getCurrentAdmin(controller.signal)).resolves.toEqual(data)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/auth/me', { signal: controller.signal })
    expect(adminClient.defaults.timeout).toBe(0)
    expect(csrfCalls).toBe(0)
  })

  it('honors me cancellation without invalidating CSRF or notifying', async () => {
    const listener = listen()
    await getCsrfToken()
    const controller = new AbortController()
    controller.abort()
    const error = await getCurrentAdmin(controller.signal).catch((error: unknown) => error)
    expect(axios.isCancel(error)).toBe(true)
    await getCsrfToken()
    expect(csrfCalls).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null], ['array', []], ['missing', {}],
    ...[0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1].map((id): [string, JsonBodyType] => [`id ${id}`, { ...user, id }]),
    ...['', ' \n ', null, 1, undefined].map((loginId): [string, JsonBodyType] => [`login ${loginId}`, { ...user, loginId }]),
    ...[null, 1, undefined].map((role): [string, JsonBodyType] => [`role ${role}`, { ...user, role }]),
  ])('rejects malformed me: %s', async (_label, data) => {
    server.use(http.get(`${endpoint}/me`, () => HttpResponse.json(data)))
    await expect(getCurrentAdmin()).rejects.toThrow('관리자 계정 응답')
  })

  it.each([201, 202, 204])('rejects me success status %s', async (status) => {
    server.use(http.get(`${endpoint}/me`, () => status === 204
      ? new HttpResponse(null, { status }) : HttpResponse.json(user, { status })))
    await expect(getCurrentAdmin()).rejects.toThrow('관리자 계정 응답')
  })
})

describe('CSRF cache and request epochs', () => {
  it('shares one fetch between parallel callers and caches only in memory', async () => {
    const get = vi.spyOn(adminClient, 'get')
    await expect(Promise.all([getCsrfToken(), getCsrfToken(), getCsrfToken()])).resolves.toEqual([csrf, csrf, csrf])
    await expect(getCsrfToken()).resolves.toEqual(csrf)
    expect(csrfCalls).toBe(1)
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/auth/csrf')
    expect(adminClient.defaults.headers.common['X-CSRF-TOKEN']).toBeUndefined()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    clearAdminSession()
    await getCsrfToken()
    expect(csrfCalls).toBe(2)
  })

  it.each([
    ['null', null], ['array', []], ['missing', {}],
    ['wrong header', { ...csrf, headerName: 'Authorization' }],
    ['wrong case', { ...csrf, headerName: 'x-csrf-token' }],
    ['wrong parameter', { ...csrf, parameterName: 'csrf' }],
    ...['', ' \n ', null, 1, undefined].map((token): [string, JsonBodyType] => [`token ${token}`, { ...csrf, token }]),
  ])('rejects invalid CSRF and permits a later explicit fetch: %s', async (_label, data) => {
    server.use(http.get(`${endpoint}/csrf`, () => HttpResponse.json(data)))
    await expect(getCsrfToken()).rejects.toThrow('보안 토큰 응답')
    server.use(http.get(`${endpoint}/csrf`, () => HttpResponse.json(csrf)))
    await expect(getCsrfToken()).resolves.toEqual(csrf)
  })

  it.each([201, 202, 204])('rejects CSRF success status %s', async (status) => {
    server.use(http.get(`${endpoint}/csrf`, () => status === 204
      ? new HttpResponse(null, { status }) : HttpResponse.json(csrf, { status })))
    await expect(getCsrfToken()).rejects.toThrow('보안 토큰 응답')
  })

  it('never reinstalls a late token or clears the newer pending fetch', async () => {
    const oldStarted = deferred()
    const oldGate = deferred()
    const newStarted = deferred()
    const newGate = deferred()
    let calls = 0
    server.use(http.get(`${endpoint}/csrf`, async () => {
      calls += 1
      if (calls === 1) {
        oldStarted.resolve()
        await oldGate.promise
        return HttpResponse.json({ ...csrf, token: 'old' })
      }
      newStarted.resolve()
      await newGate.promise
      return HttpResponse.json({ ...csrf, token: 'new' })
    }))
    const old = getCsrfToken().catch((error: unknown) => error)
    await oldStarted.promise
    clearAdminSession()
    const current = getCsrfToken()
    await newStarted.promise
    oldGate.resolve()
    expect(await old).toBeInstanceOf(Error)
    const shared = getCsrfToken()
    newGate.resolve()
    await expect(current).resolves.toEqual({ ...csrf, token: 'new' })
    await expect(shared).resolves.toEqual({ ...csrf, token: 'new' })
    await expect(getCsrfToken()).resolves.toEqual({ ...csrf, token: 'new' })
    expect(calls).toBe(2)
  })
})

describe('login and logout rotation', () => {
  it('always refreshes before login, then rotates after success and uses the new token for logout', async () => {
    const order: string[] = []
    let calls = 0
    server.use(
      http.get(`${endpoint}/csrf`, ({ request }) => {
        expect(request.credentials).toBe('include')
        calls += 1
        order.push(`csrf-${calls}`)
        return HttpResponse.json({ ...csrf, token: `token-${calls}` })
      }),
      http.post(`${endpoint}/login`, async ({ request }) => {
        order.push('login')
        expect(request.credentials).toBe('include')
        expect(request.headers.get('X-CSRF-TOKEN')).toBe('token-2')
        expect(await request.json()).toEqual(credentials)
        return HttpResponse.json(user)
      }),
      http.post(`${endpoint}/logout`, ({ request }) => {
        order.push('logout')
        expect(request.credentials).toBe('include')
        expect(request.headers.get('X-CSRF-TOKEN')).toBe('token-3')
        expect(request.body).toBeNull()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await getCsrfToken()
    const post = vi.spyOn(adminClient, 'post')
    await expect(loginAdmin(credentials)).resolves.toEqual(user)
    await expect(logoutAdmin()).resolves.toBeUndefined()
    await getCsrfToken()
    expect(order).toEqual(['csrf-1', 'csrf-2', 'login', 'csrf-3', 'logout', 'csrf-4'])
    expect(post).toHaveBeenNthCalledWith(1, '/api/auth/login', credentials, { headers: { 'X-CSRF-TOKEN': 'token-2' } })
    expect(post).toHaveBeenNthCalledWith(2, '/api/auth/logout', undefined, { headers: { 'X-CSRF-TOKEN': 'token-3' } })
  })

  it('returns non-admin login users for the UI to reject', async () => {
    server.use(http.post(`${endpoint}/login`, () => HttpResponse.json({ ...user, role: 'USER' })))
    await expect(loginAdmin(credentials)).resolves.toEqual({ ...user, role: 'USER' })
    expect(csrfCalls).toBe(2)
  })

  it.each([400, 401, 403, 500])('preserves login HTTP %s and never retries POST', async (status) => {
    const listener = listen()
    const data = { code: status === 401 ? 'INVALID_CREDENTIALS' : 'INVALID_REQUEST', message: 'Safe failure.' }
    const post = vi.spyOn(adminClient, 'post')
    server.use(http.post(`${endpoint}/login`, () => HttpResponse.json(data, { status })))
    await expect(loginAdmin(credentials)).rejects.toMatchObject({ response: { status, data } })
    expect(post).toHaveBeenCalledTimes(1)
    expect(csrfCalls).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('preserves login network failure without retry', async () => {
    const post = vi.spyOn(adminClient, 'post')
    server.use(http.post(`${endpoint}/login`, () => HttpResponse.error()))
    await expect(loginAdmin(credentials)).rejects.toMatchObject({ isAxiosError: true })
    expect(post).toHaveBeenCalledTimes(1)
    expect(csrfCalls).toBe(1)
  })

  it.each([null, {}, { ...user, id: 0 }, { ...user, loginId: '' }, { ...user, role: null }])('rejects malformed login response %j without retry', async (data) => {
    const post = vi.spyOn(adminClient, 'post')
    server.use(http.post(`${endpoint}/login`, () => HttpResponse.json(data)))
    await expect(loginAdmin(credentials)).rejects.toThrow('로그인 응답')
    expect(post).toHaveBeenCalledTimes(1)
    await getCsrfToken()
    expect(csrfCalls).toBe(2)
  })

  it.each([201, 202, 204])('rejects login success status %s', async (status) => {
    server.use(http.post(`${endpoint}/login`, () => status === 204
      ? new HttpResponse(null, { status }) : HttpResponse.json(user, { status })))
    await expect(loginAdmin(credentials)).rejects.toThrow('로그인 응답')
  })

  it('does not retry a successful login if its refreshed CSRF fetch fails', async () => {
    const post = vi.spyOn(adminClient, 'post')
    server.use(http.post(`${endpoint}/login`, () => {
      server.use(http.get(`${endpoint}/csrf`, () => HttpResponse.error()))
      return HttpResponse.json(user)
    }))
    await expect(loginAdmin(credentials)).rejects.toMatchObject({ isAxiosError: true })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each(['login', 'logout'] as const)('blocks %s when CSRF fails', async (operation) => {
    const post = vi.spyOn(adminClient, 'post')
    server.use(http.get(`${endpoint}/csrf`, () => HttpResponse.error()))
    await expect(operation === 'login' ? loginAdmin(credentials) : logoutAdmin()).rejects.toMatchObject({ isAxiosError: true })
    expect(post).not.toHaveBeenCalled()
  })

  it.each([400, 403, 500, 'network'] as const)('does not clear session/CSRF or retry logout on %s', async (status) => {
    const listener = listen()
    const post = vi.spyOn(adminClient, 'post')
    await getCsrfToken()
    server.use(http.post(`${endpoint}/logout`, () => status === 'network' ? HttpResponse.error()
      : HttpResponse.json({ code: 'ACCESS_DENIED', message: 'Safe failure.' }, { status })))
    await expect(logoutAdmin()).rejects.toMatchObject({ isAxiosError: true })
    await getCsrfToken()
    expect(csrfCalls).toBe(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears logout state on 401 and notifies only once for that request', async () => {
    const listener = listen()
    await getCsrfToken()
    server.use(http.post(`${endpoint}/logout`, () => HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: 'Expired.' }, { status: 401 })))
    await expect(logoutAdmin()).rejects.toMatchObject({ response: { status: 401 } })
    await getCsrfToken()
    expect(csrfCalls).toBe(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it.each([200, 201, 202])('does not clear state on an unexpected logout success %s', async (status) => {
    await getCsrfToken()
    server.use(http.post(`${endpoint}/logout`, () => HttpResponse.json({}, { status })))
    await expect(logoutAdmin()).rejects.toThrow('로그아웃 응답')
    await getCsrfToken()
    expect(csrfCalls).toBe(1)
  })
})

describe('scoped security failure handling', () => {
  it.each([
    [401, 'AUTHENTICATION_REQUIRED', 2, 1],
    [401, 'INVALID_CREDENTIALS', 1, 0],
    [403, 'INVALID_CSRF_TOKEN', 2, 0],
    [403, 'ACCESS_DENIED', 1, 0],
    [400, 'INVALID_CSRF_TOKEN', 1, 0],
    [500, 'AUTHENTICATION_REQUIRED', 1, 0],
  ])('handles %s %s with exact clearing/notification semantics', async (status, code, calls, notifications) => {
    const listener = listen()
    await getCsrfToken()
    const data = { code, message: 'Safe failure.' }
    server.use(http.get(`${endpoint}/me`, () => HttpResponse.json(data, { status })))
    await expect(getCurrentAdmin()).rejects.toMatchObject({ response: { status, data } })
    await getCsrfToken()
    expect(csrfCalls).toBe(calls)
    expect(listener).toHaveBeenCalledTimes(notifications)
  })

  it('notifies once per concurrent failed request and allows unsubscribe', async () => {
    const listener = listen()
    const removed = vi.fn()
    subscribeAdminSessionExpired(removed)()
    server.use(http.get(`${endpoint}/me`, () => HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: 'Expired.' }, { status: 401 })))
    await Promise.allSettled([getCurrentAdmin(), getCurrentAdmin()])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(removed).not.toHaveBeenCalled()
  })

  it('preserves the raw error even if a subscriber throws', async () => {
    unsubscribe.push(subscribeAdminSessionExpired(() => { throw new Error('Listener failed') }))
    server.use(http.get(`${endpoint}/me`, () => HttpResponse.json({ code: 'AUTHENTICATION_REQUIRED', message: 'Expired.' }, { status: 401 })))
    await expect(getCurrentAdmin()).rejects.toMatchObject({ isAxiosError: true, response: { status: 401 } })
  })

  it.each([401, 403])('ignores stale %s after a new login has rotated tokens', async (status) => {
    const listener = listen()
    const started = deferred()
    const gate = deferred()
    server.use(
      http.get(`${endpoint}/me`, async () => {
        started.resolve()
        await gate.promise
        return HttpResponse.json({ code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'INVALID_CSRF_TOKEN', message: 'Old failure.' }, { status })
      }),
      http.post(`${endpoint}/login`, () => HttpResponse.json(user)),
    )
    const old = getCurrentAdmin().catch((error: unknown) => error)
    await started.promise
    await loginAdmin(credentials)
    gate.resolve()
    expect(await old).toMatchObject({ response: { status } })
    await getCsrfToken()
    expect(csrfCalls).toBe(2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not let an old CSRF failure erase a newly fetched token in the same session', async () => {
    const started = deferred()
    const gate = deferred()
    let calls = 0
    server.use(http.get(`${endpoint}/me`, async () => {
      calls += 1
      if (calls === 1) {
        started.resolve()
        await gate.promise
      }
      return HttpResponse.json({ code: 'INVALID_CSRF_TOKEN', message: 'Invalid.' }, { status: 403 })
    }))
    await getCsrfToken()
    const old = getCurrentAdmin().catch((error: unknown) => error)
    await started.promise
    await expect(getCurrentAdmin()).rejects.toMatchObject({ response: { status: 403 } })
    await getCsrfToken()
    gate.resolve()
    await old
    await getCsrfToken()
    expect(csrfCalls).toBe(2)
  })
})
