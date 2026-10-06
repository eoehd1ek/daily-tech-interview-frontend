import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'
import { loginAdmin } from '../api/auth'
import { getApiError } from '../api/client'
import type { AuthUser } from '../api/types'

export function AdminLoginForm({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError(null)
    if (!loginId.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.')
      return
    }
    pending.current = true
    setBusy(true)
    try {
      const user = await loginAdmin({ loginId, password })
      if (!active.current) return
      setPassword('')
      if (user.role !== 'ADMIN') {
        setError('관리자 권한이 없는 계정입니다.')
        return
      }
      onSuccess(user)
    } catch (failure) {
      if (!active.current) return
      const apiError = getApiError(failure)
      setPassword('')
      setError(apiError.status === 401 && apiError.code === 'INVALID_CREDENTIALS'
        ? '아이디 또는 비밀번호가 올바르지 않습니다.'
        : apiError.status === 403 && apiError.code === 'INVALID_CSRF_TOKEN'
          ? '로그인 보안 토큰이 만료되었습니다. 다시 로그인해주세요.'
          : apiError.message)
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  return <Stack component="form" aria-label="관리자 로그인" onSubmit={submit} spacing={2} noValidate>
    <TextField label="아이디" value={loginId} disabled={busy} autoComplete="username" fullWidth
      onChange={(event) => setLoginId(event.target.value)} />
    <TextField label="비밀번호" type="password" value={password} disabled={busy} autoComplete="current-password" fullWidth
      onChange={(event) => setPassword(event.target.value)} />
    {error && <Alert severity="error">{error}</Alert>}
    {busy && <Typography role="status">로그인 중입니다.</Typography>}
    <Button type="submit" variant="contained" disabled={busy}>로그인</Button>
  </Stack>
}

function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo: unknown = location.state?.returnTo
  // Only return to this app's protected administrator routes.
  let destination = '/admin/questions'
  if (typeof returnTo === 'string') {
    try {
      const url = new URL(returnTo, window.location.origin)
      if (url.origin === window.location.origin && /^\/admin(?:\/|$)/.test(url.pathname)
        && !/^\/admin\/login(?:\/|$)/.test(url.pathname)) {
        destination = url.pathname + url.search + url.hash
      }
    } catch { /* Ignore invalid navigation state. */ }
  }

  return <Stack spacing={3} sx={{ maxWidth: 420, mx: 'auto', width: '100%' }}>
    <Typography component="h1" variant="h4">관리자 로그인</Typography>
    <Typography color="text.secondary">질문과 평가 기준을 관리하려면 로그인해주세요.</Typography>
    <AdminLoginForm onSuccess={() => { void navigate(destination, { replace: true }) }} />
    <Button component={RouterLink} to="/">일반 서비스로</Button>
  </Stack>
}

export default AdminLoginPage
