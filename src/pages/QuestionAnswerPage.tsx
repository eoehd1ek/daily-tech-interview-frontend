import { Stack, Typography } from '@mui/material'
import { useParams } from 'react-router'

function QuestionAnswerPage() {
  const { questionId } = useParams<{ questionId: string }>()

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        질문 상세 및 답변 작성
      </Typography>
      <Typography color="text.secondary">질문 ID: {questionId}</Typography>
      <Typography color="text.secondary">
        질문 상세 조회와 답변 작성 기능은 준비 중입니다.
      </Typography>
    </Stack>
  )
}

export default QuestionAnswerPage
