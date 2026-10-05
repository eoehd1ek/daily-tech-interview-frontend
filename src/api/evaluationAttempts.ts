import { apiClient } from './client'
import type { EvaluationAttemptRequest, EvaluationResult } from './types'

export async function getEvaluationAttempt(attemptId: number, signal?: AbortSignal): Promise<EvaluationResult> {
  const response = await apiClient.get<EvaluationResult>(`/api/evaluation-attempts/${attemptId}`, { signal })
  return response.data
}

export function getEvaluationWaitTime(): number {
  const configuredWaitTime = import.meta.env.VITE_EVALUATION_TIMEOUT_MS?.trim()
  const waitTime = Number(configuredWaitTime)
  if (!configuredWaitTime || !/^\d+$/.test(configuredWaitTime) || !Number.isSafeInteger(waitTime) || waitTime <= 0 || waitTime > 2_147_483_647) {
    throw new Error('VITE_EVALUATION_TIMEOUT_MS must be a positive integer no greater than 2147483647. Set it and restart Vite.')
  }
  return waitTime
}

export async function submitEvaluationAttempt(
  questionId: number,
  request: EvaluationAttemptRequest,
): Promise<EvaluationResult> {
  const response = await apiClient.post<EvaluationResult>(
    `/api/questions/${questionId}/evaluation-attempts`, request,
  )
  // Never navigate using an unexpected success response; the server may already have saved it.
  if (response.status !== 201 || !Number.isSafeInteger(response.data?.id) || response.data.id <= 0) {
    throw new Error('평가 응답을 확인하지 못했습니다. 서버에 결과가 저장됐을 수 있습니다. 자동 재전송하지 않습니다.')
  }
  return response.data
}
