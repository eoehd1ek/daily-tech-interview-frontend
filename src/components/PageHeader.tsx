import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'

function PageHeader({ title, description, eyebrow, action }: {
  title: string, description?: string, eyebrow?: string, action?: ReactNode,
}) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}
    sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
    <Box sx={{ minWidth: 0, maxWidth: 760 }}>
      {eyebrow && <Typography variant="overline" color="text.secondary">{eyebrow}</Typography>}
      <Typography component="h1" variant="h4">{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>}
    </Box>
    {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
  </Stack>
}

export default PageHeader
