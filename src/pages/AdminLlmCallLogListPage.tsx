import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { getAdminLlmCallLogs } from '../api/adminLlmCallLogs'
import { getApiError } from '../api/client'
import type { ApiError, LlmCallLogPage } from '../api/types'
import ContentCard from '../components/ContentCard'
import PageHeader from '../components/PageHeader'
import { logFilterParams, readLogFilters } from './llmCallLogFilters'
import type { LogFilterValues } from './llmCallLogFilters'

const statuses = { STARTED: '시작 기록/종료 미확인', SUCCEEDED: '호출 성공', FAILED: '호출 실패' } as const
const purposes = { ANSWER_EVALUATION: '답변 평가', ADMIN_PREVIEW: '관리자 미리 평가' } as const
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function AdminLlmCallLogListPage() {
  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const { values, query, error: queryError } = readLogFilters(params)
  const [reload, setReload] = useState(0)
  const requestKey = `${search}|${reload}`
  const [state, setState] = useState<{ key: string; data: LlmCallLogPage | null; error: ApiError | null } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const current = state?.key === requestKey ? state : null
  const loading = !queryError && !current

  useEffect(() => {
    const parsed = readLogFilters(new URLSearchParams(search))
    if (parsed.error) return
    const controller = new AbortController()
    async function load() {
      try {
        const data = await getAdminLlmCallLogs(parsed.query, controller.signal)
        if (!controller.signal.aborted) setState({ key: `${search}|${reload}`, data, error: null })
      } catch (error) {
        const apiError = getApiError(error)
        if (!controller.signal.aborted && !apiError.isCanceled) setState({ key: `${search}|${reload}`, data: null, error: apiError })
      }
    }
    void load()
    return () => controller.abort()
  }, [search, reload])

  function applyFilters(next: LogFilterValues) {
    const nextParams = logFilterParams(next)
    const validation = readLogFilters(nextParams)
    setFormError(validation.error)
    if (!validation.error) {
      setParams(nextParams)
      setReload((count) => count + 1)
    }
  }

  return <Stack spacing={4}>
    <PageHeader eyebrow="LLM CALL LOGS" title="LLM 호출 로그"
      description="저장된 호출 기록을 조회합니다. 시각과 기간 검색은 한국 시간(KST, UTC+09:00) 기준입니다."
      action={<Button variant="outlined" disabled={loading || !!queryError} onClick={() => setReload((count) => count + 1)}>새로고침</Button>} />
    <ContentCard component="section" aria-labelledby="log-filter-title">
      <Stack spacing={2}>
        <Typography id="log-filter-title" component="h2" variant="h5">검색 조건</Typography>
        <Box component="form" aria-label="로그 검색" key={search} onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const next = Object.fromEntries(['from', 'to', 'status', 'purpose', 'model', 'size'].map((key) => [key, String(data.get(key) ?? '')])) as unknown as LogFilterValues
          applyFilters(next)
        }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="시작일 (KST)" name="from" defaultValue={values.from} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" label="종료일 (KST, 당일 포함)" name="to" defaultValue={values.to} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select label="상태" name="status" defaultValue={values.status in statuses ? values.status : ''} fullWidth>
                <MenuItem value="">전체 상태</MenuItem>
                {Object.entries(statuses).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
              <TextField select label="용도" name="purpose" defaultValue={values.purpose in purposes ? values.purpose : ''} fullWidth>
                <MenuItem value="">전체 용도</MenuItem>
                {Object.entries(purposes).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
              <TextField label="요청 모델" name="model" defaultValue={values.model} helperText="모델명 완전 일치" fullWidth slotProps={{ htmlInput: { maxLength: 255 } }} />
              <TextField label="페이지당 건수" name="size" type="number" defaultValue={values.size} slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }} sx={{ minWidth: 150 }} required />
              <Button type="submit" variant="contained" sx={{ minWidth: 90 }}>검색</Button>
              <Button type="button" sx={{ minWidth: 90 }} onClick={() => {
                setFormError(null)
                setParams({ page: '0', size: '20' })
                setReload((count) => count + 1)
              }}>초기화</Button>
            </Stack>
          </Stack>
        </Box>
        {(formError || queryError) && <Alert severity="error">{formError || queryError}</Alert>}
      </Stack>
    </ContentCard>
    <ContentCard component="section" aria-labelledby="log-list-title"><Stack spacing={2}>
      <Typography id="log-list-title" component="h2" variant="h5">호출 기록</Typography>
      <Typography variant="body2" color="text.secondary">최신 시작 일시순입니다. 호출 성공은 평가 검증·저장 성공을 보장하지 않으며, 종료 미확인은 실행 중이라는 의미가 아닙니다.</Typography>
      {loading ? <Stack direction="row" spacing={2} role="status" sx={{ alignItems: 'center' }}>
        <CircularProgress size={24} /><Typography>호출 로그를 불러오는 중입니다.</Typography>
      </Stack> : current?.error ? <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Alert severity="error">{current.error.message}</Alert>
        <Button onClick={() => setReload((count) => count + 1)} variant="outlined">다시 시도</Button>
      </Stack> : current?.data && <>
        <Typography>전체 {current.data.totalElements.toLocaleString('ko-KR')}건</Typography>
        {current.data.items.length === 0 ? <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography role="status">{current.data.totalElements === 0 ? '검색 조건에 맞는 호출 기록이 없습니다.' : '현재 페이지에 기록이 없습니다. 첫 페이지에서 다시 조회해주세요.'}</Typography>
          {current.data.page > 0 && <Button onClick={() => setParams(logFilterParams(values))}>첫 페이지로</Button>}
        </Stack> : <TableContainer sx={{ containerType: 'inline-size' }}>
          <Table size="small" aria-label="LLM 호출 기록" sx={{
            width: '100%', tableLayout: 'fixed',
            '& th, & td': { px: 0.75, py: 1.25, overflowWrap: 'anywhere', verticalAlign: 'top', fontSize: '0.8rem' },
            '& thead th:first-of-type': { textAlign: 'center' },
            '& tbody td:first-of-type': { textAlign: 'center', verticalAlign: 'middle' },
            '& .MuiChip-root': { maxWidth: '100%', height: 'auto' },
            '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.5, px: 0.75 },
            '@container (max-width: 699px)': {
              '& thead': { display: 'none' },
              '& tbody': { display: 'block' },
              '& tbody tr': { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5,
                py: 2, borderBottom: '1px solid', borderColor: 'divider' },
              '& tbody td': { display: 'block', minWidth: 0, p: 0, border: 0 },
              '& tbody td:first-of-type': { gridColumn: '1 / -1' },
              '& tbody td::before': { content: 'attr(data-label)', display: 'block', color: 'text.secondary', fontSize: '0.75rem', mb: 0.5 },
            },
          }}>
            <TableHead><TableRow>{[
               ['상세 정보', 11], ['시작 일시 (KST)', 15], ['상태', 13], ['용도', 10], ['요청 모델 / 공급자', 15],
              ['입력 토큰', 9], ['출력 토큰', 9], ['전체 토큰', 9], ['소요 시간', 9],
            ].map(([label, width]) => <TableCell key={label} sx={{ width: `${width}%` }}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{current.data.items.map((log) => <TableRow key={log.id}>
              <TableCell data-label="상세 정보"><Button component={RouterLink} to={`/admin/llm-call-logs/${log.id}${search ? `?${search}` : ''}`} aria-label={`로그 ${log.id} 상세`}
                 size="small" sx={{ width: '100%', minWidth: 0, minHeight: 36, px: 0.5, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>#{log.id}</Button></TableCell>
              <TableCell data-label="시작 일시 (KST)">{timeFormat.format(new Date(log.startedAt))}</TableCell>
              <TableCell data-label="상태"><Chip size="small" label={statuses[log.status]} color={log.status === 'FAILED' ? 'error' : log.status === 'SUCCEEDED' ? 'success' : 'default'} />
                {log.failureStage && <Typography variant="caption" sx={{ display: 'block' }}>{log.failureStage}</Typography>}</TableCell>
              <TableCell data-label="용도">{purposes[log.purpose]}</TableCell>
              <TableCell data-label="요청 모델 / 공급자">{log.requestedModel}<Typography variant="caption" sx={{ display: 'block' }}>{log.provider}</Typography></TableCell>
              {[log.inputTokens, log.outputTokens, log.totalTokens].map((tokens, index) => <TableCell key={index} data-label={['입력 토큰', '출력 토큰', '전체 토큰'][index]}>{tokens === null ? '미확인' : tokens.toLocaleString('ko-KR')}</TableCell>)}
              <TableCell data-label="소요 시간">{log.durationMs === null ? '-' : `${log.durationMs.toLocaleString('ko-KR')} ms`}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>}
        {current.data.totalPages > 0 && <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Button disabled={query.page === 0} onClick={() => setParams(logFilterParams(values, query.page - 1))}>이전 페이지</Button>
          <Typography>{query.page + 1} / {current.data.totalPages} 페이지</Typography>
          <Button disabled={query.page + 1 >= current.data.totalPages} onClick={() => setParams(logFilterParams(values, query.page + 1))}>다음 페이지</Button>
        </Stack>}
      </>}
    </Stack></ContentCard>
  </Stack>
}

export default AdminLlmCallLogListPage
