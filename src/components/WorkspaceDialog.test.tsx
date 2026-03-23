import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceDialog } from './WorkspaceDialog'

describe('WorkspaceDialog', () => {
  it('creates a workspace when name is provided', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<WorkspaceDialog open onOpenChange={vi.fn()} onSave={onSave} />)
    await user.type(screen.getByLabelText(/Name/i), 'My Space')
    await user.click(screen.getByRole('button', { name: /Create Workspace/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Space',
        description: '',
        customSystemPrompt: '',
      })
    )
  })

  it('does not save when name is empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<WorkspaceDialog open onOpenChange={vi.fn()} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /Create Workspace/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

})
