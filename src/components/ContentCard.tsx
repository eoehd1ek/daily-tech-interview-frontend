import type { ComponentProps, ElementType } from 'react'
import { Paper } from '@mui/material'

function ContentCard({ sx, ...props }: ComponentProps<typeof Paper> & { component?: ElementType }) {
  return <Paper variant="outlined" {...props} sx={[
    { p: { xs: 2.5, sm: 3 }, minWidth: 0, overflowWrap: 'anywhere' },
    ...(Array.isArray(sx) ? sx : [sx]),
  ]} />
}

export default ContentCard
