import { adminClient } from './auth'
import type { LlmCallLogDetail, LlmCallLogPage, LlmCallLogQuery, LlmCallLogSummary } from './types'

const endpoint = '/api/admin/llm-call-logs'

export async function getAdminLlmCallLogs(query: LlmCallLogQuery, signal?: AbortSignal): Promise<LlmCallLogPage> {
  const response = await adminClient.get<unknown>(endpoint, { params: query, signal })
  const data = response.data
  if (response.status !== 200 || !isRecord(data) || !Array.isArray(data.items) ||
    !data.items.every(isSummary) || data.page !== query.page || data.size !== query.size ||
    !isCount(data.totalElements) || !isCount(data.totalPages)) {
    throw new Error('Invalid LLM call log page response')
  }
  return data as unknown as LlmCallLogPage
}

export async function getAdminLlmCallLog(id: number, signal?: AbortSignal): Promise<LlmCallLogDetail> {
  const response = await adminClient.get<unknown>(`${endpoint}/${id}`, { signal })
  if (response.status !== 200 || !isDetail(response.data) || response.data.id !== id) {
    throw new Error('Invalid LLM call log detail response')
  }
  return response.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNullableCount(value: unknown) { return value === null || isCount(value) }
function isNullableString(value: unknown) { return value === null || typeof value === 'string' }
function isTimestamp(value: unknown) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}

function isSummary(value: unknown): value is LlmCallLogSummary {
  return isRecord(value) && isCount(value.id) && value.id > 0 &&
    ['ANSWER_EVALUATION', 'ADMIN_PREVIEW'].includes(value.purpose as string) &&
    ['STARTED', 'SUCCEEDED', 'FAILED'].includes(value.status as string) &&
    typeof value.provider === 'string' && typeof value.requestedModel === 'string' &&
    isNullableString(value.responseModel) && isTimestamp(value.startedAt) &&
    (value.completedAt === null || isTimestamp(value.completedAt)) &&
    ['durationMs', 'inputTokens', 'outputTokens', 'totalTokens'].every((key) => isNullableCount(value[key])) &&
    (value.failureStage === null || ['MODEL_CALL', 'EMPTY_RESPONSE', 'RESPONSE_PARSE'].includes(value.failureStage as string)) &&
    (value.status === 'STARTED'
      ? ['completedAt', 'durationMs', 'responseModel', 'inputTokens', 'outputTokens', 'totalTokens', 'failureStage'].every((key) => value[key] === null)
      : value.completedAt !== null && value.durationMs !== null &&
        (value.status === 'FAILED' ? value.failureStage !== null : value.failureStage === null))
}

function isDetail(value: unknown): value is LlmCallLogDetail {
  if (!isSummary(value)) return false
  const data = value as unknown as Record<string, unknown>
  const response = data.responseData
  const error = data.errorData
  return [data.questionId, data.evaluationAttemptId].every((id) => id === null || (isCount(id) && id > 0)) &&
    isTimestamp(data.createdAt) && isNullableString(data.responseId) && isNullableString(data.finishReason) &&
    isNullableCount(data.cachedInputTokens) && isNullableCount(data.reasoningTokens) &&
    Array.isArray(data.requestMessages) && data.requestMessages.every((message: unknown) =>
      isRecord(message) && typeof message.role === 'string' && typeof message.content === 'string') &&
    isRecord(data.requestOptions) &&
    (response === null || (isRecord(response) && Array.isArray(response.results) &&
      response.results.every((result: unknown) => isRecord(result) && isCount(result.index) &&
        isNullableString(result.text) && isNullableString(result.finishReason) && isRecord(result.metadata)) &&
      isRecord(response.metadata) && (response.usage === null || isRecord(response.usage)))) &&
    (error === null || (isRecord(error) && typeof error.type === 'string' && isNullableString(error.message) &&
      Array.isArray(error.causes) && error.causes.every((cause: unknown) => isRecord(cause) &&
        typeof cause.type === 'string' && isNullableString(cause.message)))) &&
    (data.status === 'FAILED' ? error !== null : error === null) &&
    (data.status !== 'STARTED' || ['responseId', 'finishReason', 'cachedInputTokens', 'reasoningTokens', 'responseData'].every((key) => data[key] === null))
}
