import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AppBar, Avatar, Box, Button, Container, Divider, Drawer, IconButton,
  Link, ListItemButton, ListItemText, Stack, SvgIcon, Toolbar, Typography, useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Link as RouterLink, useLocation } from 'react-router'

function AppShell({ children, mode = 'public', account, onLogout, logoutDisabled }: {
  children: ReactNode, mode?: 'public' | 'admin' | 'login', account?: string,
  onLogout?: () => void, logoutDisabled?: boolean,
}) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('lg'), { defaultMatches: true })
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const admin = mode === 'admin'
  const label = admin ? '관리자 메뉴' : '주요 메뉴'
  const section = location.pathname.includes('/results/') ? '평가 리포트'
    : location.pathname.includes('/questions/') ? admin ? '질문 편집' : '답변 워크스페이스'
      : admin ? '질문 라이브러리 관리' : mode === 'login' ? '관리자 로그인' : '질문 라이브러리'

  const navigation = <Stack sx={{ height: '100%', p: 2.5 }} spacing={3}>
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1 }}>
      <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: '0.95rem', fontWeight: 750 }}>T.</Avatar>
      <Box><Typography variant="subtitle1">기술 면접 {admin || mode === 'login' ? '관리' : '연습'}</Typography>
        <Typography variant="overline" color="text.secondary">{admin || mode === 'login' ? 'ADMIN WORKSPACE' : 'INTERVIEW WORKSPACE'}</Typography></Box>
    </Stack>
    <Box component="nav" aria-label={label}>
      <Typography variant="overline" color="text.secondary" sx={{ pl: 1 }}>WORKSPACE</Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {admin ? <>
          <ListItemButton component={RouterLink} to="/admin/questions" aria-label="질문 관리" selected={location.pathname.startsWith('/admin/questions')}
            aria-current={location.pathname.startsWith('/admin/questions') ? 'page' : undefined} onClick={() => setOpen(false)}>
            <ListItemText primary="질문 관리" secondary="질문 · 기준 · 평가 테스트" />
          </ListItemButton>
          <ListItemButton component={RouterLink} to="/" onClick={() => setOpen(false)}><ListItemText primary="일반 서비스" /></ListItemButton>
        </> : <ListItemButton component={RouterLink} to="/" aria-label={mode === 'login' ? '일반 서비스로' : '메인으로'} selected={mode === 'public'} aria-current={location.pathname === '/' ? 'page' : undefined}
          onClick={() => setOpen(false)}><ListItemText primary={mode === 'login' ? '일반 서비스로' : '메인으로'} secondary="기술 질문과 답변 연습" /></ListItemButton>}
      </Stack>
    </Box>
    <Box sx={{ flex: 1 }} />
    <Divider />
    {account ? <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.selected', color: 'text.secondary', fontSize: '0.8rem' }}>{account.slice(0, 1).toUpperCase()}</Avatar>
        <Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{account}</Typography>
          <Typography variant="caption" color="text.secondary">관리자 세션</Typography></Box>
      </Stack>
      <Button variant="outlined" color="inherit" onClick={() => { setOpen(false); onLogout?.() }} disabled={logoutDisabled}>로그아웃</Button>
    </Stack> : <Box><Typography variant="body2" sx={{ fontWeight: 650 }}>한 번의 답변, 더 나은 설명.</Typography>
      <Typography variant="caption" color="text.secondary">{mode === 'login' ? '관리자 계정으로 로그인하세요.' : '로그인 없이 질문을 선택하고 연습하세요.'}</Typography></Box>}
  </Stack>

  return <Box sx={{ minHeight: '100svh', display: 'flex' }}>
    <Link href="#main-content" sx={{ position: 'fixed', top: -80, left: 16, zIndex: 'tooltip', bgcolor: 'background.paper', p: 1.5,
      '&:focus': { top: 8 } }}>본문으로 건너뛰기</Link>
    {desktop ? <Drawer variant="permanent" sx={{ width: 248, flexShrink: 0,
      '& .MuiDrawer-paper': { width: 248, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider' } }}>{navigation}</Drawer>
      : <Drawer open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: 280, maxWidth: '85vw' } } }}>
        <Box sx={{ height: '100%' }}>
          <IconButton aria-label="메뉴 닫기" onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 4, top: 4 }}>
            <SvgIcon><path d="M6 6l12 12M6 18L18 6" fill="none" stroke="currentColor" strokeWidth="2" /></SvgIcon>
          </IconButton>{navigation}
        </Box>
      </Drawer>}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2, minHeight: { xs: 64, sm: 72 } }}>
          {!desktop && <IconButton edge="start" aria-label="메뉴 열기" aria-expanded={open} onClick={() => setOpen(true)}>
            <SvgIcon><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" /></SvgIcon>
          </IconButton>}
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{section}</Typography>
          <Typography variant="overline" color="text.secondary">{admin ? 'ADMIN' : 'TECH INTERVIEW'}</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4, lg: 5 }, px: { xs: 2, sm: 3, lg: 4 } }}>
        <Box component="main" id="main-content" tabIndex={-1} sx={{ overflowWrap: 'anywhere', outline: 'none' }}>{children}</Box>
      </Container>
    </Box>
  </Box>
}

export default AppShell
