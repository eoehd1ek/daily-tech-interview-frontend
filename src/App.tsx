import { CssBaseline, Link, Stack, ThemeProvider, Typography } from '@mui/material'
import { Link as RouterLink, Navigate, Outlet, Route, Routes } from 'react-router'
import HomePage from './pages/HomePage'
import QuestionAnswerPage from './pages/QuestionAnswerPage'
import EvaluationResultPage from './pages/EvaluationResultPage'
import AdminQuestionListPage from './pages/AdminQuestionListPage'
import AdminQuestionEditorPage from './pages/AdminQuestionEditorPage'
import AdminLayout from './pages/AdminLayout'
import AdminLoginPage from './pages/AdminLoginPage'
import AppShell from './components/AppShell'
import theme from './theme'

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route element={<AppShell><Outlet /></AppShell>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/questions/:questionId" element={<QuestionAnswerPage />} />
          <Route path="/results/:attemptId" element={<EvaluationResultPage />} />
          <Route path="*" element={<Stack spacing={2}><Typography component="h1" variant="h4">페이지를 찾을 수 없습니다</Typography>
            <Typography color="text.secondary">주소를 확인하거나 메인 링크로 돌아가주세요.</Typography></Stack>} />
        </Route>
        <Route path="/admin/login" element={<AppShell mode="login"><AdminLoginPage /></AppShell>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="questions" replace />} />
          <Route path="questions" element={<AdminQuestionListPage />} />
          <Route path="questions/new" element={<AdminQuestionEditorPage isNew />} />
          <Route path="questions/:questionId/edit" element={<AdminQuestionEditorPage isNew={false} />} />
          <Route path="*" element={<Stack spacing={2}><Typography component="h1" variant="h4">페이지를 찾을 수 없습니다</Typography>
            <Link component={RouterLink} to="/admin/questions">관리자 질문 목록으로</Link></Stack>} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
