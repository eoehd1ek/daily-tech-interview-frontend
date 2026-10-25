import type { QuestionCategory, QuestionSummary } from './types'

export const questionCategories: { code: QuestionCategory; label: string }[] = [
  { code: 'FRONTEND', label: '프론트엔드' },
  { code: 'BACKEND', label: '백엔드' },
]

export function isQuestionCategories(value: unknown): value is QuestionCategory[] {
  return Array.isArray(value) && value.length <= 5 && new Set(value).size === value.length &&
    value.every((category: unknown) => category === 'FRONTEND' || category === 'BACKEND')
}

export function isQuestionSummary(value: unknown): value is QuestionSummary {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'id' in value && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 &&
    'title' in value && typeof value.title === 'string' &&
    'categories' in value && isQuestionCategories(value.categories)
}
