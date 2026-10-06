import { adminClient, getCsrfToken } from './auth'
import type {
  AdminQuestionDetail,
  AdminQuestionRequest,
  EvaluationPreviewRequest,
  EvaluationPreviewResult,
  QuestionSummary,
} from './types'

export async function getAdminQuestions(signal?: AbortSignal): Promise<QuestionSummary[]> {
  const response = await adminClient.get<QuestionSummary[]>('/api/admin/questions', { signal })
  return response.data
}

export async function getAdminQuestion(id: number, signal?: AbortSignal): Promise<AdminQuestionDetail> {
  const response = await adminClient.get<unknown>(`/api/admin/questions/${id}`, { signal })
  if (response.status !== 200 || !isAdminQuestionDetail(response.data) || response.data.id !== id) {
    throw new Error('질문 상세 응답을 확인하지 못했습니다. 다시 조회해주세요.')
  }
  return response.data
}

export async function createAdminQuestion(request: AdminQuestionRequest): Promise<AdminQuestionDetail> {
  const csrf = await getCsrfToken()
  const response = await adminClient.post<unknown>('/api/admin/questions', request, {
    headers: { [csrf.headerName]: csrf.token },
  })
  if (response.status !== 201 || !isAdminQuestionDetail(response.data)) {
    throw new Error('저장 응답을 확인하지 못했습니다. 서버에 질문이 저장됐을 수 있습니다. 자동 재전송하지 않습니다. 목록이나 상세를 다시 조회해 확인해주세요.')
  }
  return response.data
}

export async function updateAdminQuestion(id: number, request: AdminQuestionRequest): Promise<AdminQuestionDetail> {
  const csrf = await getCsrfToken()
  const response = await adminClient.put<unknown>(`/api/admin/questions/${id}`, request, {
    headers: { [csrf.headerName]: csrf.token },
  })
  if (response.status !== 200 || !isAdminQuestionDetail(response.data) || response.data.id !== id) {
    throw new Error('저장 응답을 확인하지 못했습니다. 서버에 질문이 저장됐을 수 있습니다. 자동 재전송하지 않습니다. 목록이나 상세를 다시 조회해 확인해주세요.')
  }
  return response.data
}

export async function previewAdminQuestion(request: EvaluationPreviewRequest): Promise<EvaluationPreviewResult> {
  const csrf = await getCsrfToken()
  const response = await adminClient.post<unknown>('/api/admin/questions/evaluation-preview', request, {
    headers: { [csrf.headerName]: csrf.token },
  })
  if (response.status !== 200 || !isEvaluationPreviewResult(response.data)) {
    throw new Error('평가 테스트 응답을 확인하지 못했습니다. 입력을 유지한 채 다시 시도해주세요.')
  }
  return response.data
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

function isSafeId(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
}

function isAdminQuestionDetail(data: unknown): data is AdminQuestionDetail {
  return isRecord(data) && isSafeId(data.id) && typeof data.title === 'string' &&
    typeof data.content === 'string' && Array.isArray(data.criteria) &&
    data.criteria.every((criterion: unknown) => isRecord(criterion) && isSafeId(criterion.id) &&
      typeof criterion.content === 'string' && Number.isInteger(criterion.maxScore) &&
      Number.isInteger(criterion.displayOrder))
}

function isEvaluationPreviewResult(data: unknown): data is EvaluationPreviewResult {
  return isRecord(data) && typeof data.questionTitle === 'string' && typeof data.answer === 'string' &&
    typeof data.score === 'number' && Number.isInteger(data.score) && data.score >= 0 && data.score <= 100 &&
    (data.result === 'PASS' || data.result === 'RETRY' || data.result === 'FAIL') &&
    typeof data.strengths === 'string' && typeof data.weaknesses === 'string' && typeof data.improvements === 'string'
}
