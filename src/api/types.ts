export interface AuthUser {
  id: number
  loginId: string
  role: string
}

export interface CsrfToken {
  headerName: 'X-CSRF-TOKEN'
  parameterName: '_csrf'
  token: string
}

export interface QuestionSummary {
  id: number
  title: string
}

export interface QuestionDetail {
  id: number
  title: string
  content: string
}

export interface AdminCriterionRequest {
  content: string
  maxScore: number
  displayOrder: number
}

export interface AdminCriterionDetail extends AdminCriterionRequest {
  id: number
}

export interface AdminQuestionRequest {
  title: string
  content: string
  criteria: AdminCriterionRequest[]
}

export interface AdminQuestionDetail extends AdminQuestionRequest {
  id: number
  criteria: AdminCriterionDetail[]
}

export interface EvaluationPreviewRequest extends AdminQuestionRequest {
  answer: string
}

export interface EvaluationPreviewResult {
  questionTitle: string
  answer: string
  score: number
  result: 'PASS' | 'RETRY' | 'FAIL'
  strengths: string
  weaknesses: string
  improvements: string
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
