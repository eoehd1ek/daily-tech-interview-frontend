import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { useParams } from 'react-router'
import { getApiError } from '../api/client'
import { getEvaluationAttempt } from '../api/evaluationAttempts'
import type { ApiError, EvaluationResult } from '../api/types'
import ContentCard from '../components/ContentCard'
import PageHeader from '../components/PageHeader'

function EvaluationResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const id = Number(attemptId)

  if (!attemptId || !/^\d+$/.test(attemptId) || !Number.isSafeInteger(id) || id <= 0) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">평가 결과</Typography>
        <Alert severity="error">잘못된 평가 ID입니다. 결과 주소를 확인해주세요.</Alert>
      </Stack>
    )
  }

  return <EvaluationResultContent key={id} attemptId={id} />
}

function EvaluationResultContent({ attemptId }: { attemptId: number }) {
  const [state, setState] = useState<{
    evaluation: EvaluationResult | null
    isLoading: boolean
    error: ApiError | null
  }>({ evaluation: null, isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadEvaluation() {
      try {
        const evaluation = await getEvaluationAttempt(attemptId, controller.signal)
        if (!controller.signal.aborted) {
          setState({ evaluation, isLoading: false, error: null })
        }
      } catch (error) {
        const apiError = getApiError(error)
        if (!controller.signal.aborted && !apiError.isCanceled) {
          setState({ evaluation: null, isLoading: false, error: apiError })
        }
      }
    }

    void loadEvaluation()
    return () => controller.abort()
  }, [attemptId, reloadCount])

  function retry() {
    if (state.isLoading) return
    setState({ evaluation: null, isLoading: true, error: null })
    setReloadCount((count) => count + 1)
  }

  if (state.isLoading) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">평가 결과</Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
          <CircularProgress size={24} aria-label="평가 결과 조회 중" />
          <Typography>평가 결과를 불러오는 중입니다.</Typography>
        </Stack>
      </Stack>
    )
  }

  if (state.error) {
    const isNotFound = state.error.status === 404 && state.error.code === 'EVALUATION_ATTEMPT_NOT_FOUND'
    const isInvalidRequest = state.error.status === 400 && state.error.code === 'INVALID_REQUEST'
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography component="h1" variant="h4">평가 결과</Typography>
        <Alert severity="error">
          {isNotFound
            ? '평가 결과를 찾을 수 없습니다. 결과 주소를 확인해주세요.'
            : isInvalidRequest
              ? `잘못된 평가 결과 조회 요청입니다. ${state.error.message}`
              : state.error.message}
        </Alert>
        {!isNotFound && !isInvalidRequest && (
          <Button variant="outlined" onClick={retry}>다시 시도</Button>
        )}
      </Stack>
    )
  }

  if (!state.evaluation) return null

  const evaluation = state.evaluation
  return (
    <Stack spacing={4}>
      <PageHeader title="평가 결과" eyebrow="EVALUATION REPORT" description={evaluation.questionTitle} />
      <ContentCard><Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box><Typography variant="overline" color="text.secondary">TOTAL SCORE</Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h4" component="p" aria-label={`총점 ${evaluation.score}점, 100점 만점`}>
            {evaluation.score} / 100점
          </Typography>
          <Chip
            label={evaluation.result}
            color={evaluation.result === 'PASS' ? 'success' : evaluation.result === 'RETRY' ? 'warning' : 'error'}
          />
        </Stack></Box>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>점수와 함께 피드백을 읽고, 다음 답변에서 보완할 부분을 확인하세요.</Typography>
      </Stack></ContentCard>
      <ContentCard component="section" aria-labelledby="strengths-title"><Stack spacing={2}>
        <Typography component="h2" variant="h5" id="strengths-title">잘 설명한 부분</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{evaluation.strengths}</Typography>
      </Stack></ContentCard>
      <ContentCard component="section" aria-labelledby="weaknesses-title"><Stack spacing={2}>
        <Typography component="h2" variant="h5" id="weaknesses-title">부족하거나 잘못 설명한 부분</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{evaluation.weaknesses}</Typography>
      </Stack></ContentCard>
      <ContentCard component="section" aria-labelledby="improvements-title"><Stack spacing={2}>
        <Typography component="h2" variant="h5" id="improvements-title">개선할 부분</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{evaluation.improvements}</Typography>
      </Stack></ContentCard>
      <ContentCard component="section" aria-labelledby="submitted-answer-title" sx={{ bgcolor: 'action.hover' }}><Stack spacing={2}>
        <Typography component="h2" variant="h5" id="submitted-answer-title">제출한 답변</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{evaluation.answer}</Typography>
      </Stack></ContentCard>
    </Stack>
  )
}

export default EvaluationResultPage
