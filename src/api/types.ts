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

export type QuestionCategory = 'FRONTEND' | 'BACKEND'

export interface QuestionSummary {
  id: number
  title: string
  categories: QuestionCategory[]
}

export interface QuestionDetail {
  id: number
  title: string
  content: string
  categories: QuestionCategory[]
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
  categories: QuestionCategory[]
}

export interface AdminQuestionDetail extends AdminQuestionRequest {
  id: number
  criteria: AdminCriterionDetail[]
}

export interface EvaluationPreviewRequest extends Omit<AdminQuestionRequest, 'categories'> {
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

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }
export type LlmCallLogStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED'
export type LlmCallLogPurpose = 'ANSWER_EVALUATION' | 'ADMIN_PREVIEW'
export type LlmCallLogFailureStage = 'MODEL_CALL' | 'EMPTY_RESPONSE' | 'RESPONSE_PARSE'

export interface LlmCallLogQuery {
  page: number
  size: number
  startedFrom?: string
  startedTo?: string
  status?: LlmCallLogStatus
  purpose?: LlmCallLogPurpose
  model?: string
}

export interface LlmCallLogSummary {
  id: number
  purpose: LlmCallLogPurpose
  status: LlmCallLogStatus
  provider: string
  requestedModel: string
  responseModel: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  failureStage: LlmCallLogFailureStage | null
}

export interface LlmCallLogPage {
  items: LlmCallLogSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface LlmCallLogDetail extends LlmCallLogSummary {
  questionId: number | null
  evaluationAttemptId: number | null
  createdAt: string
  responseId: string | null
  finishReason: string | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
  requestMessages: { role: string; content: string }[]
  requestOptions: JsonObject
  responseData: {
    results: { index: number; text: string | null; finishReason: string | null; metadata: JsonObject }[]
    metadata: JsonObject
    usage: JsonObject | null
  } | null
  errorData: { type: string; message: string | null; causes: { type: string; message: string | null }[] } | null
}
