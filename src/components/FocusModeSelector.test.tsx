import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FocusModeSelector } from './FocusModeSelector'

describe('FocusModeSelector', () => {
  it('shows the label for the current focus mode', () => {
    render(<FocusModeSelector value="news" onChange={vi.fn()} />)
    expect(screen.getByText('News')).toBeInTheDocument()
  })

  it('changes value when a new mode is selected', () => {
    const onChange = vi.fn()
    const { container } = render(<FocusModeSelector value="all" onChange={onChange} />)
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLElement
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: /^Academic$/i }))
    expect(onChange).toHaveBeenCalledWith('academic')
  })

  it('can be disabled', () => {
    const { container } = render(
      <FocusModeSelector value="all" onChange={vi.fn()} disabled />
    )
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement
    expect(trigger).toBeDisabled()
  })
})
