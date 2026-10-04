import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { useNavigate, useParams } from 'react-router'
import { getApiError } from '../api/client'
import { getQuestion } from '../api/questions'
import { submitEvaluationAttempt } from '../api/evaluationAttempts'
import type { ApiError, QuestionDetail } from '../api/types'

const MAX_ANSWER_LENGTH = 3000

function QuestionAnswerPage() {
  const { questionId } = useParams<{ questionId: string }>()
  const id = Number(questionId)

  if (!questionId || !/^\d+$/.test(questionId) || !Number.isSafeInteger(id) || id <= 0) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">질문 상세 및 답변 작성</Typography>
        <Alert severity="error">잘못된 질문 ID입니다. 질문 목록에서 다시 선택해주세요.</Alert>
      </Stack>
    )
  }

  // A different question gets fresh lookup and draft state before it is displayed.
  return <QuestionAnswerContent key={id} questionId={id} />
}

function QuestionAnswerContent({ questionId }: { questionId: number }) {
  const navigate = useNavigate()
  const [state, setState] = useState<{
    question: QuestionDetail | null
    isLoading: boolean
    error: ApiError | null
  }>({ question: null, isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [hasBlurred, setHasBlurred] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const submissionController = useRef<AbortController | null>(null)
  const isAnswerEmpty = hasBlurred && answer.trim().length === 0
  const isAnswerTooLong = answer.length > MAX_ANSWER_LENGTH

  useEffect(() => () => submissionController.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadQuestion() {
      try {
        const question = await getQuestion(questionId, controller.signal)
        if (!controller.signal.aborted) {
          setState({ question, isLoading: false, error: null })
        }
      } catch (error) {
        const apiError = getApiError(error)
        if (!controller.signal.aborted && !apiError.isCanceled) {
          setState({ question: null, isLoading: false, error: apiError })
        }
      }
    }

    void loadQuestion()
    return () => controller.abort()
  }, [questionId, reloadCount])

  function retry() {
    if (state.isLoading) return
    setState({ question: null, isLoading: true, error: null })
    setReloadCount((count) => count + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionController.current || !state.question) return
    setHasBlurred(true)
    setSubmissionError(null)
    if (!answer.trim() || isAnswerTooLong) return

    const controller = new AbortController()
    submissionController.current = controller
    setIsSubmitting(true)
    try {
      const evaluation = await submitEvaluationAttempt(questionId, { answer }, controller.signal)
      if (!controller.signal.aborted) navigate(`/results/${evaluation.id}`)
    } catch (error) {
      if (controller.signal.aborted) return
      const apiError = getApiError(error)
      if (axios.isAxiosError(error) && !error.response) {
        setSubmissionError('평가 응답을 받지 못했습니다. 서버에서 평가와 저장이 완료됐을 수 있습니다. 자동 재전송하지 않으며, 다시 제출하면 별도의 평가가 생성될 수 있습니다.')
      } else if (!apiError.isCanceled) {
        if (apiError.status === 400 && apiError.code === 'INVALID_REQUEST') {
          setSubmissionError(`답변을 확인해주세요. ${apiError.message}`)
        } else if (apiError.status === 404 && apiError.code === 'QUESTION_NOT_FOUND') {
          setSubmissionError(`질문을 찾을 수 없습니다. 작성한 답변은 유지됩니다. 메인에서 질문을 다시 선택해주세요. ${apiError.message}`)
        } else if (apiError.status === 502 && apiError.code === 'LLM_EVALUATION_FAILED') {
          setSubmissionError(`답변 분석에 실패했습니다. 잠시 후 다시 시도해주세요. ${apiError.message}`)
        } else if (apiError.status === 500 && apiError.code === 'INTERNAL_SERVER_ERROR') {
          setSubmissionError(`서버에서 평가를 완료하지 못했습니다. ${apiError.message}`)
        } else {
          setSubmissionError(axios.isAxiosError(error) ? apiError.message : error instanceof Error ? error.message : apiError.message)
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        submissionController.current = null
        setIsSubmitting(false)
      }
    }
  }

  if (state.isLoading) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">질문 상세 및 답변 작성</Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
          <CircularProgress size={24} aria-label="질문 조회 중" />
          <Typography>질문을 불러오는 중입니다.</Typography>
        </Stack>
      </Stack>
    )
  }

  if (state.error) {
    const isNotFound = state.error.status === 404 && state.error.code === 'QUESTION_NOT_FOUND'
    const isInvalidRequest = state.error.status === 400 && state.error.code === 'INVALID_REQUEST'
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography component="h1" variant="h4">질문 상세 및 답변 작성</Typography>
        <Alert severity="error">
          {isNotFound
            ? '질문을 찾을 수 없습니다. 질문 목록에서 다시 선택해주세요.'
            : isInvalidRequest
              ? `잘못된 질문 조회 요청입니다. ${state.error.message}`
              : state.error.message}
        </Alert>
        {!isNotFound && !isInvalidRequest && (
          <Button variant="outlined" onClick={retry}>다시 시도</Button>
        )}
      </Stack>
    )
  }

  if (!state.question) return null

  const question = state.question
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
      <Stack component="section" spacing={2} aria-labelledby="question-title" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h1" variant="h4" id="question-title">
          {question.title}
        </Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{question.content}</Typography>
      </Stack>
      <Stack component="form" onSubmit={submit} spacing={2} aria-labelledby="answer-title" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h5" id="answer-title">답변 작성</Typography>
        <TextField
          id="answer"
          label="답변"
          multiline
          fullWidth
          minRows={10}
          value={answer}
          disabled={isSubmitting}
          onChange={(event) => setAnswer(event.target.value)}
          onBlur={() => setHasBlurred(true)}
          error={isAnswerEmpty || isAnswerTooLong}
          helperText={`${isAnswerEmpty ? '공백이 아닌 답변을 작성해주세요. ' : isAnswerTooLong ? '답변은 3,000자 이내로 작성해주세요. ' : ''}${answer.length.toLocaleString()} / ${MAX_ANSWER_LENGTH.toLocaleString()}자`}
          slotProps={{ htmlInput: { maxLength: MAX_ANSWER_LENGTH } }}
        />
        <Typography variant="body2" color="text.secondary">
          실제 개인정보나 민감한 정보는 작성하지 마세요.
        </Typography>
        {submissionError && <Alert severity="error">{submissionError}</Alert>}
        {isSubmitting && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
            <CircularProgress size={24} aria-label="답변 분석 중" />
            <Typography>답변을 분석중입니다.</Typography>
          </Stack>
        )}
        <Button variant="contained" type="submit" disabled={isSubmitting}>답변 제출</Button>
        <Typography variant="body2" color="text.secondary">
          작성 중인 답변은 페이지를 떠나거나 새로고침하면 사라집니다. 제출 중 화면을 떠나도 서버의 평가 처리가 취소되는 것은 아닙니다.
        </Typography>
      </Stack>
    </Stack>
  )
}

export default QuestionAnswerPage
