import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useParams } from 'react-router'
import { getAdminLlmCallLog } from '../api/adminLlmCallLogs'
import { getApiError } from '../api/client'
import type { ApiError, LlmCallLogDetail } from '../api/types'
import ContentCard from '../components/ContentCard'
import PageHeader from '../components/PageHeader'

function formatTimestamp(value: string | null) {
  if (value === null) return '-'
  return `${new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).format(new Date(value))} KST (Asia/Seoul)`
}

function Section({ title, children, id }: { title: string, children: ReactNode, id: string }) {
  return <ContentCard component="section" aria-labelledby={id}>
    <Stack spacing={2}>
      <Typography component="h2" variant="h5" id={id}>{title}</Typography>
      {children}
    </Stack>
  </ContentCard>
}

function Fields({ values }: { values: [string, string | number | null][] }) {
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(140px, 1fr) 3fr' }, gap: 1 }}>
    {values.map(([label, value]) => <Box key={label} sx={{ display: 'contents' }}>
      <Typography component="dt" color="text.secondary">{label}</Typography>
      <Typography component="dd" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0 }}>{value ?? '-'}</Typography>
    </Box>)}
  </Box>
}

function RawBlock({ label, value }: { label: string, value: unknown }) {
  return <Box component="details" sx={{ minWidth: 0 }}>
    <Box component="summary" sx={{ cursor: 'pointer', py: 1, fontWeight: 600 }}>{label}</Box>
    <Box component="pre" sx={{ m: 0, p: 2, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.85rem', maxWidth: '100%' }}>
      {value === null ? '-' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </Box>
  </Box>
}

function AdminLlmCallLogDetailPage() {
  const { logId } = useParams<{ logId: string }>()
  const location = useLocation()
  const id = Number(logId)
  const isValid = !!logId && /^\d+$/.test(logId) && Number.isSafeInteger(id) && id > 0

  return <Stack spacing={4}>
    <PageHeader title="LLM 호출 로그 상세" eyebrow="LLM CALL LOG"
      description="저장된 호출 기록을 조회합니다. 새로고침은 LLM을 호출하지 않습니다."
      action={<Button component={RouterLink} to={'/admin/llm-call-logs' + location.search} variant="outlined">LLM 호출 로그 목록으로</Button>} />
    {isValid ? <LogDetail key={id} id={id} /> : <Alert severity="error">잘못된 로그 ID입니다. 주소를 확인해주세요.</Alert>}
  </Stack>
}

function LogDetail({ id }: { id: number }) {
  const [state, setState] = useState<{
    log: LlmCallLogDetail | null, isLoading: boolean, error: ApiError | null,
  }>({ log: null, isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadLog() {
      try {
        const log = await getAdminLlmCallLog(id, controller.signal)
        if (!controller.signal.aborted) setState({ log, isLoading: false, error: null })
      } catch (failure) {
        const error = getApiError(failure)
        if (!controller.signal.aborted && !error.isCanceled) setState({ log: null, isLoading: false, error })
      }
    }
    void loadLog()
    return () => controller.abort()
  }, [id, reloadCount])

  function refresh() {
    if (state.isLoading) return
    setState({ log: null, isLoading: true, error: null })
    setReloadCount((count) => count + 1)
  }

  if (state.isLoading) return <Stack direction="row" spacing={2} role="status" sx={{ alignItems: 'center' }}>
    <CircularProgress size={24} aria-label="LLM 호출 로그 조회 중" />
    <Typography>LLM 호출 로그를 불러오는 중입니다.</Typography>
  </Stack>

  if (state.error) return <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
    <Alert severity="error">{state.error.status === 404 && state.error.code === 'LLM_CALL_LOG_NOT_FOUND'
      ? 'LLM 호출 기록을 찾을 수 없습니다. 주소를 확인해주세요.'
      : state.error.status === 403
        ? 'LLM 호출 로그를 조회할 권한이 없습니다.'
        : state.error.message}</Alert>
    <Button variant="outlined" onClick={refresh}>다시 시도</Button>
  </Stack>

  const log = state.log
  if (!log) return null
  const statusLabel = { STARTED: '시작 기록/종료 미확인', SUCCEEDED: '호출 성공', FAILED: '호출 실패' }[log.status]
  const purposeLabel = { ANSWER_EVALUATION: '사용자 답변 평가', ADMIN_PREVIEW: '관리자 미리 평가' }[log.purpose]

  return <Stack spacing={3} sx={{ minWidth: 0 }}>
    <Button variant="outlined" onClick={refresh} sx={{ alignSelf: 'flex-end' }}>새로고침</Button>
    <Section title="기본 정보" id="log-basic-title">
      <Fields values={[
        ['로그 ID', log.id], ['상태', `${statusLabel} (${log.status})`], ['용도', `${purposeLabel} (${log.purpose})`],
        ['공급자', log.provider], ['요청 모델', log.requestedModel], ['응답 모델', log.responseModel], ['실패 단계', log.failureStage],
      ]} />
      {log.status === 'SUCCEEDED' && <Alert severity="info">호출 성공은 모델 응답 수신 및 클라이언트 파싱 완료를 뜻하며, 이후 평가 검증·점수 계산·평가 기록 저장 성공을 의미하지 않습니다.</Alert>}
      {log.status === 'STARTED' && <Alert severity="warning">종료 상태가 기록되지 않았습니다. 현재 실행 중이거나 응답·과금이 없었다는 의미는 아닙니다.</Alert>}
      <Typography variant="body2" color="text.secondary">애플리케이션의 논리적 호출 스냅샷이며 실제 HTTP 원문이나 SDK 재시도별 내역을 보장하지 않습니다.</Typography>
    </Section>
    <Section title="시간 정보" id="log-time-title">
      <Fields values={[
        ['시작 일시', formatTimestamp(log.startedAt)], ['완료 일시', formatTimestamp(log.completedAt)],
        ['생성 일시', formatTimestamp(log.createdAt)], ['호출 소요 시간', log.durationMs === null ? '-' : `${log.durationMs} ms`],
      ]} />
      <Typography variant="body2" color="text.secondary">모든 일시는 KST (Asia/Seoul)입니다. 호출 소요 시간은 SDK 내부 재시도를 포함하며, 시작·완료 일시의 차이와 같지 않을 수 있습니다.</Typography>
    </Section>
    <Section title="연결 ID 및 종료 사유" id="log-ids-title">
      <Fields values={[
        ['질문 ID', log.questionId], ['평가 ID', log.evaluationAttemptId], ['공급자 응답 ID', log.responseId], ['종료 사유', log.finishReason],
      ]} />
      <Typography variant="body2" color="text.secondary">평가 ID가 없다고 평가 실패를 단정할 수 없습니다. 공급자 응답 ID는 HTTP 요청 ID가 아닙니다.</Typography>
    </Section>
    <Section title="토큰 사용량" id="log-tokens-title">
      <Fields values={[
        ['입력 토큰', log.inputTokens ?? '미확인'], ['출력 토큰', log.outputTokens ?? '미확인'], ['전체 토큰', log.totalTokens ?? '미확인'],
        ['캐시 입력 토큰', log.cachedInputTokens ?? '미확인'], ['추론 토큰', log.reasoningTokens ?? '미확인'],
      ]} />
      <Typography variant="body2" color="text.secondary">미확인은 공급자 미제공 또는 확보 불가이며 0과 다릅니다. 최종 응답에서 확보한 값으로 모든 전송 시도의 과금 총합이 아닙니다. 전체 토큰을 합산해 보정하지 않으며 캐시·추론 토큰은 각각 입력·출력의 세부 항목입니다.</Typography>
    </Section>
    <Section title="요청 메시지" id="log-messages-title">
      {log.requestMessages.length === 0 ? <Typography>-</Typography> : log.requestMessages.map((message, index) =>
        <RawBlock key={index} label={`메시지 ${index + 1} · ${message.role}`} value={message.content} />)}
    </Section>
    <Section title="요청 옵션" id="log-options-title">
      <RawBlock label="요청 옵션 JSON" value={log.requestOptions} />
    </Section>
    <Section title="응답 데이터" id="log-response-title">
      {log.responseData === null ? <Typography>-</Typography> : <>
        {log.responseData.results.length === 0 && <Typography>응답 결과가 없습니다.</Typography>}
        {log.responseData.results.map((result) => <Stack key={result.index} spacing={1}>
          <Typography component="h3" variant="h6">응답 결과 {result.index}</Typography>
          <Fields values={[[`결과 ${result.index} 종료 사유`, result.finishReason]]} />
          <RawBlock label={`결과 ${result.index} 원문`} value={result.text} />
          <RawBlock label={`결과 ${result.index} 메타데이터 JSON`} value={result.metadata} />
        </Stack>)}
        <RawBlock label="응답 메타데이터 JSON" value={log.responseData.metadata} />
        <RawBlock label="상세 사용량 JSON" value={log.responseData.usage} />
      </>}
    </Section>
    <Section title="오류 정보" id="log-error-title">
      <RawBlock label="오류 정보 JSON" value={log.errorData} />
    </Section>
  </Stack>
}

export default AdminLlmCallLogDetailPage
