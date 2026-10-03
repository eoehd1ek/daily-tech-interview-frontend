export interface QuestionSummary {
  id: number
  title: string
}

export interface QuestionDetail {
  id: number
  title: string
  content: string
}

export interface EvaluationAttemptRequest {
  answer: string
}

// Shared by evaluation submission and saved result retrieval.
export interface EvaluationResult {
  id: number
  questionId: number
  questionTitle: string
  answer: string
  score: number
  result: 'PASS' | 'RETRY' | 'FAIL'
  strengths: string
  weaknesses: string
  improvements: string
  createdAt: string
}

export interface ApiErrorResponse {
  code: string
  message: string
}

// Frontend error information, including failures without a server response.
export interface ApiError {
  status?: number
  code?: string
  message: string
  isCanceled: boolean
}
