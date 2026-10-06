import { http, HttpResponse } from 'msw'
import { clearAdminSession } from '../api/auth'
import { server } from './server'

export const adminUser = { id: 1, loginId: 'admin', role: 'ADMIN' }
export const csrfToken = { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-admin-csrf' }

export const adminAuthHandlers = [
  http.get('http://api.test/api/auth/csrf', () => HttpResponse.json(csrfToken)),
  http.get('http://api.test/api/auth/me', () => HttpResponse.json(adminUser)),
  http.post('http://api.test/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
]

export function setupAdminAuth() {
  clearAdminSession()
  server.use(...adminAuthHandlers)
}
