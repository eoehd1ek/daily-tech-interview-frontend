import { Box, Container, CssBaseline, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router'
import HomePage from './pages/HomePage'
import QuestionAnswerPage from './pages/QuestionAnswerPage'
import EvaluationResultPage from './pages/EvaluationResultPage'
import AdminQuestionListPage from './pages/AdminQuestionListPage'
import AdminQuestionEditorPage from './pages/AdminQuestionEditorPage'
import AdminLayout from './pages/AdminLayout'
import AdminLoginPage from './pages/AdminLoginPage'

function App() {
  const location = useLocation()
  const isAdmin = /^\/admin(?:\/|$)/.test(location.pathname)
  return (
    <>
      <CssBaseline />
      <Box sx={{ minHeight: '100svh' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
          <Stack spacing={4}>
            <Stack
              component="header"
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
            >
              <Typography variant="h6" component="p">
                {isAdmin ? '기술 면접 관리' : '기술 면접 연습'}
              </Typography>
              {!isAdmin && <Stack component="nav" aria-label="주요 메뉴" direction="row" spacing={2}>
                <Link component={RouterLink} to="/">메인으로</Link>
              </Stack>}
            </Stack>
            <Box component="main" sx={{ overflowWrap: 'anywhere' }}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/questions/:questionId" element={<QuestionAnswerPage />} />
                <Route path="/results/:attemptId" element={<EvaluationResultPage />} />
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="questions" replace />} />
                  <Route path="questions" element={<AdminQuestionListPage />} />
                  <Route path="questions/new" element={<AdminQuestionEditorPage isNew />} />
                  <Route path="questions/:questionId/edit" element={<AdminQuestionEditorPage isNew={false} />} />
                  <Route path="*" element={<Stack spacing={2}><Typography component="h1" variant="h4">페이지를 찾을 수 없습니다</Typography>
                    <Link component={RouterLink} to="/admin/questions">관리자 질문 목록으로</Link></Stack>} />
                </Route>
                <Route
                  path="*"
                  element={
                    <Stack spacing={2}>
                      <Typography component="h1" variant="h4">
                        페이지를 찾을 수 없습니다
                      </Typography>
                      <Typography color="text.secondary">
                        주소를 확인하거나 상단의 메인 링크로 돌아가주세요.
                      </Typography>
                    </Stack>
                  }
                />
              </Routes>
            </Box>
          </Stack>
        </Container>
      </Box>
    </>
  )
}

export default App
