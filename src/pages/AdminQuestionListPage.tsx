import { useEffect, useState } from 'react'
import {
  Alert, Button, CircularProgress, List, ListItem, ListItemButton,
  ListItemText, Stack, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { getApiError } from '../api/client'
import { getAdminQuestions } from '../api/adminQuestions'
import type { ApiError, QuestionSummary } from '../api/types'

function AdminQuestionListPage() {
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
        const questions = await getAdminQuestions(controller.signal)
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
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography component="h1" variant="h4">질문 관리</Typography>
        <Typography color="text.secondary">
          수정할 질문을 선택하거나 새 질문 작성을 시작하세요.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          현재 관리자 기능에는 로그인·권한 확인이 없습니다. 로컬 또는 접근이 제한된 환경에서 사용하세요.
        </Typography>
        <Button component={RouterLink} to="/admin/questions/new" variant="contained">
          새 질문 만들기
        </Button>
      </Stack>
      <Stack component="section" spacing={2} aria-labelledby="admin-question-list-title">
        <Typography component="h2" variant="h5" id="admin-question-list-title">관리자 질문 목록</Typography>
        {state.isLoading ? (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
            <CircularProgress size={24} aria-label="관리자 질문 목록 조회 중" />
            <Typography>관리자 질문 목록을 불러오는 중입니다.</Typography>
          </Stack>
        ) : state.error ? (
          <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Alert severity="error">
              {state.error.status === 500 && state.error.code === 'INTERNAL_SERVER_ERROR'
                ? `관리자 질문 목록을 불러오지 못했습니다. ${state.error.message}`
                : state.error.message}
            </Alert>
            <Button variant="outlined" onClick={retry}>다시 시도</Button>
          </Stack>
        ) : state.questions.length === 0 ? (
          <Typography role="status" color="text.secondary">아직 등록된 질문이 없습니다.</Typography>
        ) : (
          <List disablePadding aria-labelledby="admin-question-list-title">
            {state.questions.map((question) => (
              <ListItem key={question.id} disablePadding divider>
                <ListItemButton component={RouterLink} to={`/admin/questions/${question.id}/edit`}>
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

export default AdminQuestionListPage
