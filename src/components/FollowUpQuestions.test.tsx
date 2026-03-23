import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FollowUpQuestions } from './FollowUpQuestions'

describe('FollowUpQuestions', () => {
  it('returns null when there are no questions', () => {
    const { container } = render(
      <FollowUpQuestions questions={[]} onQuestionClick={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders questions and calls onQuestionClick', async () => {
    const user = userEvent.setup()
    const onQuestionClick = vi.fn()
    render(
      <FollowUpQuestions
        questions={['First?', 'Second?']}
        onQuestionClick={onQuestionClick}
      />
    )
    await user.click(screen.getByRole('button', { name: /First\?/i }))
    expect(onQuestionClick).toHaveBeenCalledWith('First?')
  })

  it('disables buttons while loading', () => {
    render(
      <FollowUpQuestions
        questions={['Q']}
        onQuestionClick={vi.fn()}
        isLoading
      />
    )
    expect(screen.getByRole('button', { name: /Q/i })).toBeDisabled()
  })
})
