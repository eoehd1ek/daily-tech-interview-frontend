import { useEffect, useState } from 'react'
import {
  Alert, Button, CircularProgress, List, ListItem, ListItemButton,
  Box, Chip, ListItemText, Stack, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { getApiError } from '../api/client'
import { getQuestions } from '../api/questions'
import type { ApiError, QuestionSummary } from '../api/types'
import ContentCard from '../components/ContentCard'
import PageHeader from '../components/PageHeader'

function HomePage() {
  const [state, setState] = useState<{
    questions: QuestionSummary[]
    isLoading: boolean
    error: ApiError | null
  }>({ questions: [], isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadQuestions() {
      try {
        const questions = await getQuestions(controller.signal)
        if (!controller.signal.aborted) {
          setState({ questions, isLoading: false, error: null })
        }
      } catch (error) {
        const apiError = getApiError(error)
        if (!controller.signal.aborted && !apiError.isCanceled) {
          setState({ questions: [], isLoading: false, error: apiError })
        }
      }
    }

    void loadQuestions()
    return () => controller.abort()
  }, [reloadCount])

  function retry() {
    if (state.isLoading) return
    setState({ questions: [], isLoading: true, error: null })
    setReloadCount((count) => count + 1)
  }

  return (
    <Stack spacing={4}>
      <PageHeader eyebrow="PRACTICE / FEEDBACK / GROWTH" title="기술 질문에 답하고, 피드백으로 성장하세요"
        description="기술 질문에 직접 답변하고, AI 평가로 잘 설명한 부분과 보완할 부분을 확인해보세요." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {[
          ['01', '질문 선택', '설명하고 싶은 기술 질문을 고르세요.'],
          ['02', '내 언어로 답변', '핵심 개념과 이유를 직접 정리하세요.'],
          ['03', '피드백 확인', '강점과 개선점을 다음 답변에 연결하세요.'],
        ].map(([number, title, description]) => <ContentCard key={number} sx={{ flex: 1, p: 2.5 }}>
          <Typography variant="overline" color="text.secondary">{number}</Typography>
          <Typography variant="subtitle1">{title}</Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </ContentCard>)}
      </Stack>
      <ContentCard component="section" aria-labelledby="question-list-title">
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h2" variant="h5" id="question-list-title">
          질문 목록
        </Typography>
        {!state.isLoading && !state.error && <Chip size="small" variant="outlined" label={`${state.questions.length}개 질문`} />}
        </Stack>
        {state.isLoading ? (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
            <CircularProgress size={24} aria-label="질문 목록 조회 중" />
            <Typography>질문 목록을 불러오는 중입니다.</Typography>
          </Stack>
        ) : state.error ? (
          <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Alert severity="error">
              {state.error.status === 500 && state.error.code === 'INTERNAL_SERVER_ERROR'
                ? `질문 목록을 불러오지 못했습니다. ${state.error.message}`
                : state.error.message}
            </Alert>
            <Button variant="outlined" onClick={retry} disabled={state.isLoading}>
              다시 시도
            </Button>
          </Stack>
        ) : state.questions.length === 0 ? (
          <Typography role="status" color="text.secondary">
            아직 등록된 질문이 없습니다.
          </Typography>
        ) : (
          <List disablePadding aria-labelledby="question-list-title">
            {state.questions.map((question, index) => (
              <ListItem key={question.id} disablePadding divider>
                <ListItemButton component={RouterLink} to={`/questions/${question.id}`} sx={{ py: 2, gap: 2 }}>
                  <Typography aria-hidden variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', minWidth: 24 }}>{String(index + 1).padStart(2, '0')}</Typography>
                  <ListItemText primary={question.title} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                  <Box component="span" aria-hidden sx={{ color: 'text.secondary' }}>&gt;</Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Stack></ContentCard>
    </Stack>
  )
}

export default HomePage
