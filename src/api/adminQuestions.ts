import { apiClient } from './client'
import type { QuestionSummary } from './types'

export async function getAdminQuestions(signal?: AbortSignal): Promise<QuestionSummary[]> {
  const response = await apiClient.get<QuestionSummary[]>('/api/admin/questions', { signal })
  return response.data
}
