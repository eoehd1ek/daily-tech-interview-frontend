import { apiClient } from './client'
import type { QuestionDetail, QuestionSummary } from './types'

export async function getQuestions(signal?: AbortSignal): Promise<QuestionSummary[]> {
  const response = await apiClient.get<QuestionSummary[]>('/api/questions', { signal })
  return response.data
}

export async function getQuestion(questionId: number, signal?: AbortSignal): Promise<QuestionDetail> {
  const response = await apiClient.get<QuestionDetail>(`/api/questions/${questionId}`, { signal })
  return response.data
}
