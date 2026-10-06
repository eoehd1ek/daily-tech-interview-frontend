import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from './client'
import type { AuthUser, CsrfToken } from './types'

export const adminClient = axios.create({
  baseURL: apiClient.defaults.baseURL,
  headers: { Accept: 'application/json' },
  withCredentials: true,
})

let csrfToken: CsrfToken | undefined
let pendingCsrf: Promise<CsrfToken> | undefined
let csrfEpoch = 0
let sessionEpoch = 0
const requestEpochs = new WeakMap<InternalAxiosRequestConfig, number>()
const requestCsrfEpochs = new WeakMap<InternalAxiosRequestConfig, number>()
const expiredListeners = new Set<() => void>()
const staleSessionMessage = '관리자 세션이 변경되었습니다. 다시 시도해주세요.'

function clearCsrf() {
  csrfEpoch += 1
  csrfToken = undefined
  pendingCsrf = undefined
}

export function clearAdminSession(): void {
  sessionEpoch += 1
  clearCsrf()
}

export function subscribeAdminSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener)
  return () => { expiredListeners.delete(listener) }
}

adminClient.interceptors.request.use((config) => {
  requestEpochs.set(config, sessionEpoch)
  requestCsrfEpochs.set(config, csrfEpoch)
  // A session may be cleared between awaiting CSRF and dispatching the write.
  const token = config.headers.get('X-CSRF-TOKEN')
  if (token !== undefined && token !== csrfToken?.token) {
    throw new Error(staleSessionMessage)
  }
  return config
})

adminClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.config && requestEpochs.get(error.config) === sessionEpoch) {
    const status = error.response?.status
    const code = error.response?.data?.code
    if (status === 401 && code === 'AUTHENTICATION_REQUIRED') {
      clearCsrf()
      for (const listener of expiredListeners) {
        // Listener failures must not replace the original HTTP error.
        try { listener() } catch { /* Preserve the request failure. */ }
      }
    } else if (status === 403 && code === 'INVALID_CSRF_TOKEN' && requestCsrfEpochs.get(error.config) === csrfEpoch) {
      clearCsrf()
    }
  }
  return Promise.reject(error)
})

export async function getCurrentAdmin(signal?: AbortSignal): Promise<AuthUser> {
  const response = await adminClient.get<unknown>('/api/auth/me', { signal })
  if (response.status !== 200 || !isAuthUser(response.data)) {
    throw new Error('관리자 계정 응답을 확인하지 못했습니다. 다시 시도해주세요.')
  }
  return response.data
}

export async function getCsrfToken(): Promise<CsrfToken> {
  const epoch = csrfEpoch
  if (!pendingCsrf && !csrfToken) {
    const pending = adminClient.get<unknown>('/api/auth/csrf').then((response) => {
      if (epoch !== csrfEpoch) throw new Error(staleSessionMessage)
      if (response.status !== 200 || !isCsrfToken(response.data)) {
        throw new Error('보안 토큰 응답을 확인하지 못했습니다. 다시 시도해주세요.')
      }
      csrfToken = response.data
      return csrfToken
    }).finally(() => {
      if (pendingCsrf === pending) pendingCsrf = undefined
    })
    pendingCsrf = pending
  }
  const token = csrfToken ?? await pendingCsrf!
  if (epoch !== csrfEpoch) throw new Error(staleSessionMessage)
  return token
}

export async function loginAdmin(request: { loginId: string; password: string }): Promise<AuthUser> {
  clearAdminSession()
  const epoch = sessionEpoch
  const csrf = await getCsrfToken()
  const response = await adminClient.post<unknown>('/api/auth/login', request, {
    headers: { [csrf.headerName]: csrf.token },
  })
  if (epoch !== sessionEpoch) throw new Error(staleSessionMessage)
  clearAdminSession()
  if (response.status !== 200 || !isAuthUser(response.data)) {
    throw new Error('로그인 응답을 확인하지 못했습니다. 세션을 다시 확인해주세요.')
  }
  await getCsrfToken()
  return response.data
}

export async function logoutAdmin(): Promise<void> {
  const epoch = sessionEpoch
  try {
    const csrf = await getCsrfToken()
    const response = await adminClient.post('/api/auth/logout', undefined, {
      headers: { [csrf.headerName]: csrf.token },
    })
    if (response.status !== 204) {
      throw new Error('로그아웃 응답을 확인하지 못했습니다. 세션을 다시 확인해주세요.')
    }
    if (epoch === sessionEpoch) clearAdminSession()
  } catch (error) {
    if (epoch === sessionEpoch && axios.isAxiosError(error) && error.response?.status === 401) clearAdminSession()
    throw error
  }
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

function isAuthUser(data: unknown): data is AuthUser {
  return isRecord(data) && typeof data.id === 'number' && Number.isSafeInteger(data.id) && data.id > 0 &&
    typeof data.loginId === 'string' && data.loginId.trim().length > 0 && typeof data.role === 'string'
}

function isCsrfToken(data: unknown): data is CsrfToken {
  return isRecord(data) && data.headerName === 'X-CSRF-TOKEN' && data.parameterName === '_csrf' &&
    typeof data.token === 'string' && data.token.trim().length > 0
}
