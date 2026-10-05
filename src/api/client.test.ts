import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { apiClient, getApiError } from './client'

function responseError(status: number, data: unknown) {
  return new axios.AxiosError('HTTP error', undefined, undefined, undefined, {
    status, data, statusText: 'Error', headers: {}, config: { headers: new axios.AxiosHeaders() },
  })
}

describe('getApiError', () => {
  it.each([
    [400, 'INVALID_REQUEST'], [404, 'QUESTION_NOT_FOUND'],
    [404, 'EVALUATION_ATTEMPT_NOT_FOUND'], [502, 'LLM_EVALUATION_FAILED'],
    [500, 'INTERNAL_SERVER_ERROR'],
  ])('preserves HTTP %s and code %s', (status, code) => {
    expect(getApiError(responseError(status, { code, message: '사용자 안내' }))).toEqual({
      status, code, message: '사용자 안내', isCanceled: false,
    })
  })

  it.each([null, undefined, [], '<html>proxy error</html>', { code: 1, message: 'bad' }, { code: 'BAD', message: null }])(
    'uses a safe fallback for malformed body %j', (data) => {
      const error = getApiError(responseError(502, data))
      expect(error).toMatchObject({ status: 502, isCanceled: false })
      expect(error.code).toBeUndefined()
      expect(error.message).toContain('요청을 완료하지 못했습니다')
    },
  )

  it('falls back for blank server messages without losing the code', () => {
    expect(getApiError(responseError(400, { code: 'INVALID_REQUEST', message: '  ' })))
      .toMatchObject({ code: 'INVALID_REQUEST', message: expect.stringContaining('요청을 완료하지 못했습니다') })
  })

  it.each(['ERR_NETWORK', 'ECONNABORTED'])('handles transport error %s without exposing internal messages', (code) => {
    const error = getApiError(new axios.AxiosError('internal transport details', code))
    expect(error.status).toBeUndefined()
    expect(error.code).toBeUndefined()
    expect(error.message).not.toContain('internal transport details')
    expect(error.isCanceled).toBe(false)
  })

  it('recognizes canceled requests', () => {
    expect(getApiError(new axios.CanceledError())).toEqual({ message: '', isCanceled: true })
  })

  it('does not expose unexpected exception messages', () => {
    expect(getApiError(new Error('private details')).message).not.toContain('private details')
  })
})

it('uses the test-only API origin and full /api request paths', () => {
  expect(apiClient.getUri({ url: '/api/questions' })).toBe('http://api.test/api/questions')
})
