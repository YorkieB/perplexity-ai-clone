import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FocusModeSelector } from './FocusModeSelector'

describe('FocusModeSelector', () => {
  it('shows the label for the current focus mode', () => {
    render(<FocusModeSelector value="news" onChange={vi.fn()} />)
    expect(screen.getByText('News')).toBeInTheDocument()
  })

  it('can be disabled', () => {
    const { container } = render(
      <FocusModeSelector value="all" onChange={vi.fn()} disabled />
    )
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement
    expect(trigger).toBeDisabled()
  })
})
