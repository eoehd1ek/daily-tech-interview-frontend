import { useEffect, useState } from 'react'
import {
  Alert, Button, Chip, CircularProgress, List, ListItem, ListItemButton,
  ListItemText, Stack, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { getApiError } from '../api/client'
import { getAdminQuestions } from '../api/adminQuestions'
import type { ApiError, QuestionCategory, QuestionSummary } from '../api/types'
import ContentCard from '../components/ContentCard'
import PageHeader from '../components/PageHeader'
import QuestionCategories from '../components/QuestionCategories'
import QuestionCategoryFilter from '../components/QuestionCategoryFilter'

function AdminQuestionListPage() {
  const [state, setState] = useState<{
    questions: QuestionSummary[]
    isLoading: boolean
    error: ApiError | null
  }>({ questions: [], isLoading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)
  const [category, setCategory] = useState<QuestionCategory | 'ALL'>('ALL')
  const visibleQuestions = category === 'ALL'
    ? state.questions
    : state.questions.filter((question) => question.categories.includes(category))

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
      <PageHeader eyebrow="QUESTION LIBRARY" title="질문 관리" description="수정할 질문을 선택하거나 새 질문 작성을 시작하세요."
        action={<Button component={RouterLink} to="/admin/questions/new" variant="contained">
          새 질문 만들기
        </Button>} />
      <ContentCard component="section" aria-labelledby="admin-question-list-title"><Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography component="h2" variant="h5" id="admin-question-list-title">관리자 질문 목록</Typography>
          {!state.isLoading && !state.error && <Chip size="small" variant="outlined" label={`${visibleQuestions.length}개 질문`} />}
        </Stack>
        <QuestionCategoryFilter value={category} onChange={setCategory} />
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
        ) : visibleQuestions.length === 0 ? (
          <Typography role="status" color="text.secondary">선택한 카테고리에 해당하는 질문이 없습니다.</Typography>
        ) : (
          <List disablePadding aria-labelledby="admin-question-list-title">
            {visibleQuestions.map((question) => (
              <ListItem key={question.id} disablePadding divider>
                <ListItemButton component={RouterLink} to={`/admin/questions/${question.id}/edit`} aria-label={question.title} sx={{ py: 2 }}>
                  <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <ListItemText primary={question.title} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                    <QuestionCategories categories={question.categories} />
                  </Stack>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Stack></ContentCard>
    </Stack>
  )
}

export default AdminQuestionListPage
