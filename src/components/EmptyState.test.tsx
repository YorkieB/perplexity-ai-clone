import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders headline and calls onExampleClick when a suggestion is pressed', async () => {
    const user = userEvent.setup()
    const onExampleClick = vi.fn()
    render(<EmptyState onExampleClick={onExampleClick} />)

    expect(
      screen.getByRole('heading', { name: /what would you like to know/i })
    ).toBeInTheDocument()

    const first = screen.getByRole('button', {
      name: /quantum computing/i,
    })
    await user.click(first)
    expect(onExampleClick).toHaveBeenCalledWith(
      'Explain quantum computing in simple terms'
    )
  })
})
