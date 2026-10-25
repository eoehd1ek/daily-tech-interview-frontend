import { expect, it } from 'vitest'
import { kstDateBoundary, logFilterParams, readLogFilters } from './llmCallLogFilters'

it('uses explicit KST midnight and exclusive next-day boundaries across months and leap years', () => {
  expect(kstDateBoundary('2026-10-25')).toBe('2026-10-25T00:00:00+09:00')
  expect(kstDateBoundary('2026-12-31', true)).toBe('2027-01-01T00:00:00+09:00')
  expect(kstDateBoundary('2024-02-29', true)).toBe('2024-03-01T00:00:00+09:00')
  expect(kstDateBoundary('2026-02-29')).toBeUndefined()
  expect(kstDateBoundary('2026-13-01')).toBeUndefined()
  expect(kstDateBoundary('0000-01-01')).toBeUndefined()
})

it('maps inclusive same-day UI dates to an AND query and preserves exact model text', () => {
  const result = readLogFilters(new URLSearchParams('from=2026-10-25&to=2026-10-25&status=FAILED&purpose=ADMIN_PREVIEW&model=gpt-6-sol&page=2&size=50'))
  expect(result.error).toBeNull()
  expect(result.query).toEqual({ page: 2, size: 50, startedFrom: '2026-10-25T00:00:00+09:00',
    startedTo: '2026-10-26T00:00:00+09:00', status: 'FAILED', purpose: 'ADMIN_PREVIEW', model: 'gpt-6-sol' })
  expect(readLogFilters(new URLSearchParams()).query).toEqual({ page: 0, size: 20 })
  expect(logFilterParams({ from: '', to: '', status: '', purpose: '', model: '', size: '20' }).toString()).toBe('page=0&size=20')
})

it.each(['from=2026-02-30', 'to=9999-12-31', 'from=2026-10-26&to=2026-10-25', 'status=RUNNING',
  'purpose=PUBLIC', 'model=+++', `model=${'m'.repeat(256)}`, 'size=0', 'size=101', 'page=-1', 'page=1.2', 'page=2147483647'])('rejects invalid filters %s', (query) => {
  expect(readLogFilters(new URLSearchParams(query)).error).not.toBeNull()
})
