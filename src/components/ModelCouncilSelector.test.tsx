import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ModelCouncilSelector } from './ModelCouncilSelector'

describe('ModelCouncilSelector', () => {
  it('confirms when at least two models stay selected', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ModelCouncilSelector
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        defaultSelected={['gpt-4o', 'gpt-4o-mini']}
      />
    )
    await user.click(screen.getByRole('button', { name: /Start Council/i }))
    expect(onConfirm).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes and restores defaults on cancel', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    render(
      <ModelCouncilSelector
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        defaultSelected={['gpt-4o', 'gpt-4o-mini']}
      />
    )
    await user.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not confirm when fewer than two models are selected', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ModelCouncilSelector
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        defaultSelected={['gpt-4o', 'claude-3.5-sonnet']}
      />
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[2])
    expect(screen.getByRole('button', { name: /Start Council/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Start Council/i }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
