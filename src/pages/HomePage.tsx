import { useEffect, useState } from 'react'
import {
  Alert, Button, CircularProgress, List, ListItem, ListItemButton,
  ListItemText, Stack, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { getApiError } from '../api/client'
import { getQuestions } from '../api/questions'
import type { ApiError, QuestionSummary } from '../api/types'

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
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">
          기술 질문에 답하고, 피드백으로 성장하세요
        </Typography>
        <Typography color="text.secondary">
          기술 질문에 직접 답변하고, AI 평가로 잘 설명한 부분과 보완할 부분을 확인해보세요.
        </Typography>
      </Stack>
      <Stack component="section" spacing={2} aria-labelledby="question-list-title">
        <Typography component="h2" variant="h5" id="question-list-title">
          질문 목록
        </Typography>
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
            {state.questions.map((question) => (
              <ListItem key={question.id} disablePadding divider>
                <ListItemButton component={RouterLink} to={`/questions/${question.id}`}>
                  <ListItemText primary={question.title} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Stack>
    </Stack>
  )
}

export default HomePage
