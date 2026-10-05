import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient } from './client'
import { getEvaluationAttempt, submitEvaluationAttempt } from './evaluationAttempts'

const endpoint = 'http://api.test/api/questions/1/evaluation-attempts'

describe('submitEvaluationAttempt', () => {
  it('applies 180 seconds only to POST and sends the original answer', async () => {
    const post = vi.spyOn(apiClient, 'post')
    let body: unknown
    server.use(http.post(endpoint, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ id: 42 }, { status: 201 })
    }))
    await expect(submitEvaluationAttempt(1, { answer: '  원문\n답변  ' })).resolves.toEqual({ id: 42 })
    expect(body).toEqual({ answer: '  원문\n답변  ' })
    expect(post).toHaveBeenCalledWith('/api/questions/1/evaluation-attempts', { answer: '  원문\n답변  ' }, { signal: undefined, timeout: 180000 })
    expect(apiClient.defaults.timeout).toBe(0)
  })

  it.each(['', '0', '-1', 'abc', '1.5', 'Infinity', '2147483648'])(
    'rejects invalid timeout %j before a POST', async (value) => {
      vi.stubEnv('VITE_EVALUATION_TIMEOUT_MS', value)
      const post = vi.spyOn(apiClient, 'post')
      await expect(submitEvaluationAttempt(1, { answer: '답변' })).rejects.toThrow('VITE_EVALUATION_TIMEOUT_MS')
      expect(post).not.toHaveBeenCalled()
      server.use(http.get('http://api.test/api/evaluation-attempts/42', () => HttpResponse.json({ id: 42 })))
      await expect(getEvaluationAttempt(42)).resolves.toEqual({ id: 42 })
    },
  )

  it.each([{ id: 0 }, { id: -1 }, { id: '42' }, { id: 9007199254740992 }, {}, null])(
    'rejects invalid success ID %j', async (data) => {
      server.use(http.post(endpoint, () => HttpResponse.json(data, { status: 201 })))
      await expect(submitEvaluationAttempt(1, { answer: '답변' })).rejects.toThrow('서버에 결과가 저장됐을 수 있습니다')
    },
  )

  it('rejects 202 instead of treating it as a completed evaluation', async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({ id: 42 }, { status: 202 })))
    await expect(submitEvaluationAttempt(1, { answer: '답변' })).rejects.toThrow('평가 응답')
  })
})
