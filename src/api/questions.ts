import { apiClient } from './client'
import type { QuestionSummary } from './types'

export async function getQuestions(signal?: AbortSignal): Promise<QuestionSummary[]> {
  const response = await apiClient.get<QuestionSummary[]>('/api/questions', { signal })
  return response.data
}
