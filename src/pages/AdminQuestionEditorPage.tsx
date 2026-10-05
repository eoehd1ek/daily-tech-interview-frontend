import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material'
import { Link as RouterLink, useBeforeUnload, useBlocker, useParams } from 'react-router'
import { createAdminQuestion, getAdminQuestion, previewAdminQuestion, updateAdminQuestion } from '../api/adminQuestions'
import { getApiError } from '../api/client'
import { getEvaluationWaitTime } from '../api/evaluationAttempts'
import type { AdminQuestionDetail, AdminQuestionRequest, EvaluationPreviewResult } from '../api/types'

type Criterion = { key: number, content: string, maxScore: string, displayOrder: string }

function ordered(criteria: Criterion[]) {
  return [...criteria].sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder))
}

function requestOf(title: string, content: string, criteria: Criterion[]): AdminQuestionRequest {
  return { title, content, criteria: ordered(criteria).map((criterion) => ({
    content: criterion.content, maxScore: Number(criterion.maxScore), displayOrder: Number(criterion.displayOrder),
  })) }
}

function AdminQuestionEditorPage({ isNew }: { isNew: boolean }) {
  const { questionId } = useParams()
  const id = Number(questionId)
  if (!isNew && (!questionId || !/^\d+$/.test(questionId) || !Number.isSafeInteger(id) || id <= 0)) {
    return <Stack spacing={2}><Typography component="h1" variant="h4">질문 수정</Typography>
      <Alert severity="error">잘못된 질문 ID입니다.</Alert>
      <Button component={RouterLink} to="/admin/questions">관리자 질문 목록으로</Button></Stack>
  }
  return <EditorLoader key={isNew ? 'new' : id} questionId={isNew ? null : id} />
}

function EditorLoader({ questionId }: { questionId: number | null }) {
  const [detail, setDetail] = useState<AdminQuestionDetail | null>(null)
  const [error, setError] = useState<ReturnType<typeof getApiError> | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (questionId === null) return
    const controller = new AbortController()
    void getAdminQuestion(questionId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setDetail(result)
    }).catch((failure: unknown) => {
      const apiError = getApiError(failure)
      if (!controller.signal.aborted && !apiError.isCanceled) setError(apiError)
    })
    return () => controller.abort()
  }, [questionId, reload])

  if (questionId === null || detail) return <QuestionEditor initial={detail} />
  return <Stack spacing={2}>
    <Typography component="h1" variant="h4">질문 수정</Typography>
    {error ? <>
      <Alert severity="error">{error.status === 404 && error.code === 'QUESTION_NOT_FOUND'
        ? '질문을 찾을 수 없습니다.' : error.message}</Alert>
      {error.status !== 404 && error.status !== 400 && <Button onClick={() => { setError(null); setReload((value) => value + 1) }}>다시 시도</Button>}
    </> : <Stack direction="row" spacing={2} role="status" sx={{ alignItems: 'center' }}>
      <CircularProgress size={24} /><Typography>수정할 질문을 불러오는 중입니다.</Typography>
    </Stack>}
    <Button component={RouterLink} to="/admin/questions">관리자 질문 목록으로</Button>
  </Stack>
}

function QuestionEditor({ initial }: { initial: AdminQuestionDetail | null }) {
  const source = initial ? [...initial.criteria].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id) : []
  const renumbered = source.some((criterion) => criterion.displayOrder <= 0)
  const [questionId, setQuestionId] = useState(initial?.id ?? null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [criteria, setCriteria] = useState<Criterion[]>(() => initial ? source.map((criterion, index) => ({
    key: index, content: criterion.content, maxScore: String(criterion.maxScore),
    displayOrder: String(renumbered ? index + 1 : criterion.displayOrder),
  })) : [{ key: 0, content: '', maxScore: '100', displayOrder: '1' }])
  const nextKey = useRef(criteria.length)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial
    ? { title: initial.title, content: initial.content, criteria: source.map(({ content, maxScore, displayOrder }) => ({ content, maxScore, displayOrder })) }
    : requestOf('', '', criteria)))
  const [answer, setAnswer] = useState('')
  const [validated, setValidated] = useState(false)
  const [previewValidated, setPreviewValidated] = useState(false)
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [result, setResult] = useState<EvaluationPreviewResult | null>(null)
  const [normalizationNotice, setNormalizationNotice] = useState(renumbered)
  const operation = useRef<{ timer?: number } | null>(null)
  const dragged = useRef<number | null>(null)
  const request = requestOf(title, content, criteria)
  const dirty = JSON.stringify(request) !== baseline
  const protect = dirty || answer.length > 0 || busy !== null
  const blocker = useBlocker(protect)
  useBeforeUnload((event) => {
    if (protect) { event.preventDefault(); event.returnValue = '' }
  })
  useEffect(() => () => {
    if (operation.current?.timer !== undefined) window.clearTimeout(operation.current.timer)
    operation.current = null
  }, [])

  const total = request.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0)
  const titleInvalid = !title.trim() || title.length > 200
  const contentInvalid = !content.trim() || content.length > 10000
  const orders = criteria.map((criterion) => Number(criterion.displayOrder))
  const criterionErrors = criteria.map((criterion) => ({
    content: !criterion.content.trim() || criterion.content.length > 1000,
    score: !criterion.maxScore.trim() || !Number.isInteger(Number(criterion.maxScore)) || Number(criterion.maxScore) < 1 || Number(criterion.maxScore) > 100,
    order: !criterion.displayOrder.trim() || !Number.isInteger(Number(criterion.displayOrder)) || Number(criterion.displayOrder) < 1
      || Number(criterion.displayOrder) > 2147483647 || orders.filter((order) => order === Number(criterion.displayOrder)).length > 1,
  }))
  const invalid = titleInvalid || contentInvalid || criteria.length < 1 || criteria.length > 10 || total !== 100
    || criterionErrors.some((error) => error.content || error.score || error.order)
  const answerInvalid = !answer.trim() || answer.length > 3000

  function changed() { setResult(null); setPreviewError(null); setSaved(false) }
  function updateCriterion(key: number, field: 'content' | 'maxScore' | 'displayOrder', value: string) {
    if (operation.current) return
    changed()
    setCriteria((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item))
  }
  function swap(first: number, second: number) {
    if (operation.current || first === second) return
    const a = criteria.find((item) => item.key === first)
    const b = criteria.find((item) => item.key === second)
    if (!a || !b) return
    changed()
    setCriteria(ordered(criteria.map((item) => item.key === first ? { ...item, displayOrder: b.displayOrder }
      : item.key === second ? { ...item, displayOrder: a.displayOrder } : item)))
  }
  function failureMessage(failure: unknown, testing: boolean) {
    if (failure instanceof Error && !axios.isAxiosError(failure)) return failure.message
    const error = getApiError(failure)
    if (error.status === 413) return '요청 내용이 너무 큽니다. 입력 길이를 확인해주세요.'
    if (!error.status) return testing
      ? '평가 응답을 받지 못했습니다. 다시 테스트하면 추가 LLM 비용이 발생할 수 있습니다.'
      : '저장 응답을 확인하지 못했습니다. 서버에 저장됐을 수 있으므로 관리자 목록에서 확인해주세요. 자동 재전송하지 않습니다.'
    if (error.status === 404 && error.code === 'QUESTION_NOT_FOUND') return '질문을 찾을 수 없습니다. 입력은 유지됩니다. 관리자 목록에서 확인해주세요.'
    return error.message
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.current) return
    setValidated(true)
    setSaveError(null)
    setSaved(false)
    if (invalid) return
    const current = {}
    operation.current = current
    setBusy('save')
    try {
      const detail = questionId === null ? await createAdminQuestion(request) : await updateAdminQuestion(questionId, request)
      if (operation.current !== current) return
      const sorted = [...detail.criteria].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
      setQuestionId(detail.id)
      setTitle(detail.title)
      setContent(detail.content)
      setCriteria(sorted.map((criterion) => ({ key: nextKey.current++, content: criterion.content,
        maxScore: String(criterion.maxScore), displayOrder: String(criterion.displayOrder) })))
      setBaseline(JSON.stringify({ title: detail.title, content: detail.content,
        criteria: sorted.map(({ content, maxScore, displayOrder }) => ({ content, maxScore, displayOrder })) }))
      setNormalizationNotice(false)
      setResult(null)
      setSaved(true)
    } catch (failure) {
      if (operation.current === current) setSaveError(failureMessage(failure, false))
    } finally {
      if (operation.current === current) { operation.current = null; setBusy(null) }
    }
  }
  async function preview() {
    if (operation.current) return
    setValidated(true)
    setPreviewValidated(true)
    setPreviewError(null)
    setResult(null)
    if (invalid || answerInvalid) return
    let waitTime: number
    try { waitTime = getEvaluationWaitTime() }
    catch { setPreviewError('평가 대기시간 설정을 확인해주세요.'); return }
    const current: { timer?: number } = {}
    operation.current = current
    current.timer = window.setTimeout(() => {
      if (operation.current !== current) return
      operation.current = null
      setBusy(null)
      setPreviewError('서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요. 이전 테스트는 계속 처리될 수 있으며 재테스트하면 추가 LLM 비용이 발생할 수 있습니다.')
    }, waitTime)
    setBusy('preview')
    try {
      const evaluation = await previewAdminQuestion({ ...request, answer })
      if (operation.current === current) setResult(evaluation)
    } catch (failure) {
      if (operation.current === current) setPreviewError(failureMessage(failure, true))
    } finally {
      if (operation.current === current) {
        window.clearTimeout(current.timer)
        operation.current = null
        setBusy(null)
      }
    }
  }

  return <Stack spacing={3}>
    <Typography component="h1" variant="h4">{questionId === null ? '새 질문 만들기' : '질문 수정'}</Typography>
    <Typography color="text.secondary">저장하면 사용자 질문 목록에 바로 반영됩니다. 관리자 기능에는 로그인·권한 확인이 없습니다.</Typography>
    {questionId !== null && <Typography variant="body2" color="text.secondary">질문 ID: {questionId}</Typography>}
    <Button component={RouterLink} to="/admin/questions" sx={{ alignSelf: 'flex-start' }}>관리자 질문 목록으로</Button>
    {normalizationNotice && <Alert severity="warning">기존 기준 순서를 1부터 다시 지정했습니다. 저장 전 확인해주세요.</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
      <Stack component="form" aria-label="질문 편집" onSubmit={save} noValidate spacing={2} sx={{ flex: 1, minWidth: 0 }}>
        <TextField label="질문 제목" value={title} disabled={busy !== null} fullWidth
          onChange={(event) => { changed(); setTitle(event.target.value) }} error={validated && titleInvalid}
          helperText={`${validated && titleInvalid ? '공백이 아닌 제목을 200자 이내로 작성해주세요. ' : ''}${title.length} / 200자`}
          slotProps={{ htmlInput: { maxLength: 200 } }} />
        <TextField label="질문 본문" value={content} disabled={busy !== null} fullWidth multiline minRows={5}
          onChange={(event) => { changed(); setContent(event.target.value) }} error={validated && contentInvalid}
          helperText={`${validated && contentInvalid ? '공백이 아닌 본문을 10,000자 이내로 작성해주세요. ' : ''}${content.length} / 10000자`}
          slotProps={{ htmlInput: { maxLength: 10000 } }} />
        <Typography component="h2" variant="h5">평가 기준</Typography>
        <Typography role="status" color={total === 100 ? 'text.secondary' : 'error'}>배점 합계: {Number.isFinite(total) ? total : '확인 필요'} / 100점</Typography>
        {criteria.map((criterion, index) => <Box component="fieldset" key={criterion.key}
          sx={{ m: 0, p: 2, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          onDragOver={(event) => { if (!busy) event.preventDefault() }}
          onDrop={(event) => { event.preventDefault(); if (dragged.current !== null) swap(dragged.current, criterion.key); dragged.current = null }}>
          <Typography component="legend">평가 기준 {index + 1}</Typography>
          <Stack spacing={2}>
            <Button type="button" draggable={!busy} disabled={busy !== null} aria-label={`기준 ${index + 1} 드래그 교환`}
              onDragStart={(event) => { dragged.current = criterion.key; event.dataTransfer.setData('text/plain', String(criterion.key)) }}
              onDragEnd={() => { dragged.current = null }}>드래그하여 순서 교환</Button>
            <TextField label={`기준 설명 ${index + 1}`} value={criterion.content} disabled={busy !== null} multiline fullWidth minRows={2}
              onChange={(event) => updateCriterion(criterion.key, 'content', event.target.value)} error={validated && criterionErrors[index].content}
              helperText={`${validated && criterionErrors[index].content ? '공백이 아닌 설명을 1,000자 이내로 작성해주세요. ' : ''}${criterion.content.length} / 1000자`}
              slotProps={{ htmlInput: { maxLength: 1000 } }} />
            <TextField label={`최대 배점 ${index + 1}`} type="number" value={criterion.maxScore} disabled={busy !== null}
              onChange={(event) => updateCriterion(criterion.key, 'maxScore', event.target.value)} error={validated && criterionErrors[index].score}
              helperText="1~100의 정수, 전체 합계 100점" slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }} />
            <TextField label={`순서 ${index + 1}`} type="number" value={criterion.displayOrder} disabled={busy !== null}
              onChange={(event) => updateCriterion(criterion.key, 'displayOrder', event.target.value)}
              onBlur={() => { if (!operation.current) setCriteria((items) => ordered(items)) }} error={validated && criterionErrors[index].order}
              helperText="1 이상 2147483647 이하의 중복 없는 정수" slotProps={{ htmlInput: { min: 1, max: 2147483647, step: 1 } }} />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button type="button" aria-label={`기준 ${index + 1} 위로`} disabled={busy !== null || index === 0}
                onClick={() => swap(criterion.key, criteria[index - 1].key)}>위로</Button>
              <Button type="button" aria-label={`기준 ${index + 1} 아래로`} disabled={busy !== null || index === criteria.length - 1}
                onClick={() => swap(criterion.key, criteria[index + 1].key)}>아래로</Button>
              <Button type="button" aria-label={`기준 ${index + 1} 제거`} disabled={busy !== null || criteria.length === 1}
                onClick={() => { changed(); setCriteria(criteria.filter((item) => item.key !== criterion.key)) }}>제거</Button>
            </Stack>
          </Stack>
        </Box>)}
        <Button type="button" disabled={busy !== null || criteria.length >= 10} onClick={() => {
          if (operation.current) return
          let order = 1
          while (orders.includes(order)) order++
          changed()
          setCriteria(ordered([...criteria, { key: nextKey.current++, content: '', maxScore: '1', displayOrder: String(order) }]))
        }}>기준 추가</Button>
        {validated && invalid && <Alert severity="error">질문과 평가 기준의 입력을 확인해주세요. 배점 합계는 정확히 100점이어야 합니다.</Alert>}
        {saveError && <Alert severity="error">{saveError}</Alert>}
        {saved && <Alert severity="success">질문이 저장되었습니다.</Alert>}
        {busy === 'save' && <Typography role="status">저장 중입니다.</Typography>}
        <Button type="submit" variant="contained" disabled={busy !== null}>저장</Button>
      </Stack>
      <Stack component="section" aria-labelledby="preview-title" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h5" id="preview-title">답변 평가 테스트</Typography>
        <Typography color="text.secondary">현재 폼 내용으로 평가합니다. 테스트 답변과 결과는 저장되지 않으며 LLM 비용이 발생할 수 있습니다. 개인정보는 입력하지 마세요.</Typography>
        <TextField label="테스트 답변" multiline minRows={8} fullWidth value={answer} disabled={busy !== null}
          onChange={(event) => { changed(); setAnswer(event.target.value) }} error={previewValidated && answerInvalid}
          helperText={`${previewValidated && answerInvalid ? '공백이 아닌 답변을 3,000자 이내로 작성해주세요. ' : ''}${answer.length} / 3000자`}
          slotProps={{ htmlInput: { maxLength: 3000 } }} />
        <Button type="button" variant="outlined" disabled={busy !== null} onClick={() => { void preview() }}>답변 테스트</Button>
        {busy === 'preview' && <Stack direction="row" spacing={2} role="status" sx={{ alignItems: 'center' }}>
          <CircularProgress size={24} /><Typography>답변을 분석중입니다.</Typography></Stack>}
        <Box role="status" aria-live="polite" aria-atomic="true">
          {result && <Typography>테스트가 완료되었습니다. 총점 {result.score}점, 판정 {result.result}입니다.</Typography>}
        </Box>
        {previewError && <Alert severity="error">{previewError}</Alert>}
        {result && <Stack spacing={2}>
          <Typography component="h3" variant="h6">테스트 결과</Typography>
          <Typography>총점: {result.score} / 100점</Typography>
          <Chip label={result.result} color={result.result === 'PASS' ? 'success' : result.result === 'RETRY' ? 'warning' : 'error'} sx={{ alignSelf: 'flex-start' }} />
          {([['잘 설명한 부분', result.strengths], ['부족하거나 잘못 설명한 부분', result.weaknesses], ['개선할 부분', result.improvements]] as const).map(([label, text]) =>
            <Box key={label}><Typography component="h4" variant="subtitle1">{label}</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{text}</Typography></Box>)}
        </Stack>}
      </Stack>
    </Stack>
    <Dialog open={blocker.state === 'blocked'} aria-labelledby="leave-editor-title" aria-describedby="leave-editor-description"
      onClose={() => { if (blocker.state === 'blocked') blocker.reset() }}>
      <DialogTitle id="leave-editor-title">입력을 버리고 이동할까요?</DialogTitle>
      <DialogContent id="leave-editor-description">미저장 변경이나 테스트 답변이 사라집니다. 진행 중인 서버 요청은 취소되지 않습니다.</DialogContent>
      <DialogActions>
        <Button onClick={() => { if (blocker.state === 'blocked') blocker.reset() }}>계속 편집</Button>
        <Button onClick={() => { if (blocker.state === 'blocked') blocker.proceed() }}>나가기</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}

export default AdminQuestionEditorPage
