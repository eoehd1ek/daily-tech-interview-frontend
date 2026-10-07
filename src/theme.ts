import { alpha, createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: { main: '#4F46E5', light: '#818CF8', dark: '#3730A3' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text: { primary: '#0F172A', secondary: '#475569' },
    divider: '#E2E8F0',
    success: { main: '#15803D' },
    warning: { main: '#B45309' },
    error: { main: '#B91C1C' },
    info: { main: '#0369A1' },
  },
  spacing: 8,
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    h4: { fontSize: '1.85rem', fontWeight: 750, lineHeight: 1.35, letterSpacing: '-0.04em' },
    h5: { fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.5, letterSpacing: '-0.025em' },
    h6: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.5 },
    subtitle1: { fontWeight: 650 },
    body1: { fontSize: '0.95rem', lineHeight: 1.8 },
    body2: { fontSize: '0.85rem', lineHeight: 1.7 },
    button: { textTransform: 'none', fontWeight: 650 },
    overline: { fontSize: '0.68rem', fontWeight: 750, letterSpacing: '0.13em' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { margin: 0 }, '::selection': { background: '#E0E7FF' } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40, paddingInline: 18, borderRadius: 8 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({ backgroundColor: theme.palette.background.paper, borderRadius: 8 }),
        notchedOutline: ({ theme }) => ({ borderColor: theme.palette.divider }),
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: '0.9rem' } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0, marginRight: 0 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 650 } } },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          '&.Mui-selected': { backgroundColor: alpha(theme.palette.primary.main, 0.08), color: theme.palette.primary.dark },
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        }),
      },
    },
  },
})

export default theme
