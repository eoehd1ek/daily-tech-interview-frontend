import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  Link, Stack, Typography,
} from '@mui/material'
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router'
import { clearAdminSession, getCurrentAdmin, logoutAdmin, subscribeAdminSessionExpired } from '../api/auth'
import { getApiError } from '../api/client'
import type { AuthUser } from '../api/types'
import { AdminLoginForm } from './AdminLoginPage'

function AdminLayout() {
  const location = useLocation()
  const [state, setState] = useState<{
    user: AuthUser | null, status: 'loading' | 'authenticated' | 'anonymous' | 'denied' | 'error', message?: string,
  }>({ user: null, status: 'loading' })
  const [reload, setReload] = useState(0)
  const [expired, setExpired] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const pendingLogout = useRef(false)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    void getCurrentAdmin(controller.signal).then((user) => {
      if (!controller.signal.aborted) setState({ user, status: user.role === 'ADMIN' ? 'authenticated' : 'denied' })
    }).catch((failure: unknown) => {
      const error = getApiError(failure)
      if (!controller.signal.aborted && !error.isCanceled) {
        setState({ user: null, status: error.status === 401 ? 'anonymous' : error.status === 403 ? 'denied' : 'error', message: error.message })
      }
    })
    return () => { active.current = false; controller.abort() }
  }, [reload])

  useEffect(() => {
    if (state.status !== 'authenticated') return
    return subscribeAdminSessionExpired(() => {
      setExpired(true)
      setLogoutError(null)
    })
  }, [state.status])

  async function logout() {
    if (pendingLogout.current) return
    if (!window.confirm('로그아웃하면 미저장 입력과 테스트 답변이 사라집니다. 로그아웃할까요?')) return
    pendingLogout.current = true
    setLogoutBusy(true)
    setLogoutError(null)
    try {
      await logoutAdmin()
      if (active.current) {
        setExpired(false)
        setState({ user: null, status: 'anonymous' })
      }
    } catch (failure) {
      if (!active.current) return
      const error = getApiError(failure)
      if (error.status === 401 && error.code === 'AUTHENTICATION_REQUIRED') {
        clearAdminSession()
        setState({ user: null, status: 'anonymous' })
      } else {
        setLogoutError(error.status === 403 && error.code === 'INVALID_CSRF_TOKEN'
          ? '로그아웃 보안 토큰이 만료되었습니다. 다시 시도해주세요.' : error.message)
      }
    } finally {
      pendingLogout.current = false
      if (active.current) setLogoutBusy(false)
    }
  }

  if (state.status === 'loading') return <Stack direction="row" spacing={2} role="status" sx={{ alignItems: 'center' }}>
    <CircularProgress size={24} /><Typography>관리자 세션을 확인하는 중입니다.</Typography>
  </Stack>
  if (state.status === 'anonymous') return <Navigate to="/admin/login" replace state={{ returnTo: location.pathname + location.search + location.hash }} />
  if (state.status === 'denied') return <Navigate to="/" replace />
  if (state.status === 'error') return <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
    <Alert severity="error">{state.message}</Alert>
    <Button onClick={() => { setState({ user: null, status: 'loading' }); setReload((value) => value + 1) }}>다시 시도</Button>
    <Button component={RouterLink} to="/">일반 서비스로</Button>
  </Stack>

  return <Stack spacing={3}>
    <Stack component="nav" aria-label="관리자 메뉴" direction={{ xs: 'column', sm: 'row' }} spacing={2}
      sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Link component={RouterLink} to="/">일반 서비스</Link>
        <Link component={RouterLink} to="/admin/questions">질문 관리</Link>
        <Typography variant="body2">{state.user?.loginId}</Typography>
      </Stack>
      <Button onClick={() => { void logout() }} disabled={logoutBusy || expired}>로그아웃</Button>
    </Stack>
    {logoutError && <Alert severity="error">{logoutError}</Alert>}
    {logoutBusy && <Typography role="status">로그아웃 중입니다.</Typography>}
    <Box inert={expired || logoutBusy}><Outlet /></Box>
    <Dialog open={expired} aria-labelledby="expired-session-title" aria-describedby="expired-session-description" fullWidth maxWidth="xs">
      <DialogTitle id="expired-session-title">세션이 만료되었습니다</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography id="expired-session-description">입력은 현재 페이지에 유지됩니다. 다시 로그인한 뒤 저장 또는 테스트를 직접 실행해주세요.</Typography>
          <AdminLoginForm onSuccess={(user) => { setState({ user, status: 'authenticated' }); setExpired(false) }} />
          <Button onClick={() => {
            if (window.confirm('입력과 테스트 답변을 버리고 로그인 페이지로 이동할까요?')) {
              clearAdminSession()
              setExpired(false)
              setState({ user: null, status: 'anonymous' })
            }
          }}>입력을 버리고 로그인 페이지로</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  </Stack>
}

export default AdminLayout
