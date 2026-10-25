import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import QuestionCategories from './QuestionCategories'
import QuestionCategoryFilter from './QuestionCategoryFilter'

it('renders no badge for an unclassified question', () => {
  const { container } = render(<QuestionCategories categories={[]} />)
  expect(container).toBeEmptyDOMElement()
})

it('shows text labels in canonical order with blue frontend and green backend backgrounds', () => {
  render(<QuestionCategories categories={['BACKEND', 'FRONTEND']} />)
  const frontend = screen.getByText('프론트엔드')
  const backend = screen.getByText('백엔드')
  expect(frontend.compareDocumentPosition(backend) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(frontend.parentElement).toHaveStyle({ backgroundColor: '#e3f2fd', color: '#1565c0' })
  expect(backend.parentElement).toHaveStyle({ backgroundColor: '#e8f5e9', color: '#2e7d32' })
})

it('provides the three agreed filter choices and reports only category selection', async () => {
  const onChange = vi.fn()
  render(<QuestionCategoryFilter value="ALL" onChange={onChange} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '질문 카테고리' }))
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['전체', '프론트엔드', '백엔드'])
  await user.click(screen.getByRole('option', { name: '프론트엔드' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('FRONTEND')
})
