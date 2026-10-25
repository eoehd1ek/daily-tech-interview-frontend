import { Chip, Stack } from '@mui/material'
import { blue, green } from '@mui/material/colors'
import { questionCategories } from '../api/questionCategories'
import type { QuestionCategory } from '../api/types'

function QuestionCategories({ categories }: { categories: QuestionCategory[] }) {
  if (categories.length === 0) return null
  return <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
    {questionCategories.filter(({ code }) => categories.includes(code)).map(({ code, label }) =>
      <Chip key={code} label={label} size="small" sx={{
        bgcolor: code === 'FRONTEND' ? blue[50] : green[50],
        color: code === 'FRONTEND' ? blue[800] : green[800],
      }} />)}
  </Stack>
}

export default QuestionCategories
