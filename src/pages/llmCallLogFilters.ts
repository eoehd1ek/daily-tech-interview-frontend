import type { LlmCallLogQuery } from '../api/types'

export interface LogFilterValues {
  from: string
  to: string
  status: string
  purpose: string
  model: string
  size: string
}

// A selected end date includes that whole KST day; the API end boundary is exclusive.
export function kstDateBoundary(day: string, nextDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')) return undefined
  const midnight = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return undefined
  if (nextDay) midnight.setUTCDate(midnight.getUTCDate() + 1)
  const date = midnight.toISOString().slice(0, 10)
  if (!/^\d{4}-/.test(date)) return undefined
  return `${date}T00:00:00+09:00`
}

export function readLogFilters(params: URLSearchParams): { values: LogFilterValues; query: LlmCallLogQuery; error: string | null } {
  const values = {
    from: params.get('from') ?? '', to: params.get('to') ?? '', status: params.get('status') ?? '',
    purpose: params.get('purpose') ?? '', model: params.get('model') ?? '', size: params.get('size') ?? '20',
  }
  const page = params.get('page') ?? '0'
  const query: LlmCallLogQuery = { page: Number(page), size: Number(values.size) }
  let error: string | null = null
  if (!/^\d+$/.test(page) || query.page > 2147483646 ||
    !/^\d+$/.test(values.size) || query.size < 1 || query.size > 100) error = '페이지 번호와 페이지 크기(1~100)를 확인해주세요.'
  if (values.status) {
    if (['STARTED', 'SUCCEEDED', 'FAILED'].includes(values.status)) query.status = values.status as LlmCallLogQuery['status']
    else error = '지원하지 않는 상태입니다. 검색 조건을 다시 선택해주세요.'
  }
  if (values.purpose) {
    if (['ANSWER_EVALUATION', 'ADMIN_PREVIEW'].includes(values.purpose)) query.purpose = values.purpose as LlmCallLogQuery['purpose']
    else error = '지원하지 않는 용도입니다. 검색 조건을 다시 선택해주세요.'
  }
  if (values.model) {
    if (!values.model.trim() || values.model.length > 255) error = '요청 모델은 공백이 아닌 255자 이내로 입력해주세요.'
    else query.model = values.model
  }
  if (values.from) {
    query.startedFrom = kstDateBoundary(values.from)
    if (!query.startedFrom) error = '시작일을 올바른 날짜로 입력해주세요.'
  }
  if (values.to) {
    query.startedTo = kstDateBoundary(values.to, true)
    if (!query.startedTo) error = '종료일을 올바른 날짜로 입력해주세요.'
  }
  if (values.from && values.to && values.from > values.to) error = '종료일은 시작일보다 빠를 수 없습니다.'
  return { values, query, error }
}

export function logFilterParams(values: LogFilterValues, page = 0): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), size: values.size })
  for (const key of ['from', 'to', 'status', 'purpose', 'model'] as const) {
    if (values[key]) params.set(key, values[key])
  }
  return params
}
