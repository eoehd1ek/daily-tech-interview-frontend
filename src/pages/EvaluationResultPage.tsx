import { Stack, Typography } from '@mui/material'
import { useParams } from 'react-router'

function EvaluationResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        평가 결과
      </Typography>
      <Typography color="text.secondary">평가 ID: {attemptId}</Typography>
      <Typography color="text.secondary">
        평가 결과 조회 기능은 준비 중입니다.
      </Typography>
    </Stack>
  )
}

export default EvaluationResultPage
