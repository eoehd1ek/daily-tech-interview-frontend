import { apiClient } from './client'
import type { QuestionDetail, QuestionSummary } from './types'
import { isQuestionSummary } from './questionCategories'

export async function getQuestions(signal?: AbortSignal): Promise<QuestionSummary[]> {
  const response = await apiClient.get<unknown>('/api/questions', { signal })
  if (response.status !== 200 || !Array.isArray(response.data) || !response.data.every(isQuestionSummary)) {
    throw new Error('질문 목록 응답을 확인하지 못했습니다. 다시 조회해주세요.')
  }
  return response.data
}

export async function getQuestion(questionId: number, signal?: AbortSignal): Promise<QuestionDetail> {
  const response = await apiClient.get<unknown>(`/api/questions/${questionId}`, { signal })
  if (response.status !== 200 || !isQuestionSummary(response.data) || response.data.id !== questionId ||
    !('content' in response.data) || typeof response.data.content !== 'string') {
    throw new Error('질문 상세 응답을 확인하지 못했습니다. 다시 조회해주세요.')
  }
  return response.data as QuestionDetail
}
