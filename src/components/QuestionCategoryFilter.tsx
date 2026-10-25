import { MenuItem, TextField } from '@mui/material'
import { questionCategories } from '../api/questionCategories'
import type { QuestionCategory } from '../api/types'

function QuestionCategoryFilter({ value, onChange }: {
  value: QuestionCategory | 'ALL'
  onChange: (value: QuestionCategory | 'ALL') => void
}) {
  return <TextField select label="질문 카테고리" value={value} size="small"
    sx={{ width: { xs: '100%', sm: 220 } }}
    onChange={(event) => { onChange(event.target.value as QuestionCategory | 'ALL') }}>
    <MenuItem value="ALL">전체</MenuItem>
    {questionCategories.map(({ code, label }) => <MenuItem key={code} value={code}>{label}</MenuItem>)}
  </TextField>
}

export default QuestionCategoryFilter
