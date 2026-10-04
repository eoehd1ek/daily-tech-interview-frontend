import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { useParams } from 'react-router'
import { getApiError } from '../api/client'
import { getQuestion } from '../api/questions'
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
  const [state, setState] = useState<{
    question: QuestionDetail | null
    isLoading: boolean
    error: ApiError | null
  }>({ question: null, isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [hasBlurred, setHasBlurred] = useState(false)
  const isAnswerEmpty = hasBlurred && answer.trim().length === 0

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
      <Stack component="section" spacing={2} aria-labelledby="answer-title" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h5" id="answer-title">답변 작성</Typography>
        <TextField
          id="answer"
          label="답변"
          multiline
          fullWidth
          minRows={10}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          onBlur={() => setHasBlurred(true)}
          error={isAnswerEmpty}
          helperText={`${isAnswerEmpty ? '공백이 아닌 답변을 작성해주세요. ' : ''}${answer.length.toLocaleString()} / ${MAX_ANSWER_LENGTH.toLocaleString()}자`}
          slotProps={{ htmlInput: { maxLength: MAX_ANSWER_LENGTH } }}
        />
        <Typography variant="body2" color="text.secondary">
          실제 개인정보나 민감한 정보는 작성하지 마세요.
        </Typography>
        <Button variant="contained" disabled>답변 제출</Button>
        <Typography variant="body2" color="text.secondary">
          답변 제출 기능은 준비 중입니다. 현재 작성한 답변은 제출되지 않으며, 페이지를 떠나거나 새로고침하면 사라집니다.
        </Typography>
      </Stack>
    </Stack>
  )
}

export default QuestionAnswerPage
