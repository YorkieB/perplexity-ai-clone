import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceDialog } from './WorkspaceDialog'

describe('WorkspaceDialog', () => {
  it('creates a workspace when name is provided', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<WorkspaceDialog open onOpenChange={vi.fn()} onSave={onSave} />)
    const dialog = screen.getByRole('dialog', { name: /new workspace/i })
    await user.type(within(dialog).getByPlaceholderText(/e.g. Research Project/i), 'My Space')
    await user.click(within(dialog).getByRole('button', { name: /Create Workspace/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Space',
        description: '',
        customSystemPrompt: '',
      })
    )
  })

  it('persists description and custom prompt on create', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSave = vi.fn()
    render(<WorkspaceDialog open onOpenChange={vi.fn()} onSave={onSave} />)
    const dialog = screen.getByRole('dialog', { name: /new workspace/i })
    await user.type(within(dialog).getByPlaceholderText(/e.g. Research Project/i), 'Named')
    await user.type(
      within(dialog).getByPlaceholderText(/Brief description of this workspace/i),
      'Desc text'
    )
    await user.type(
      within(dialog).getByPlaceholderText(/molecular biology/i),
      'Prompt text'
    )
    await user.click(within(dialog).getByRole('button', { name: /Create Workspace/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Named',
        description: 'Desc text',
        customSystemPrompt: 'Prompt text',
      })
    )
  })

  it('clears draft fields when canceling a new workspace', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <WorkspaceDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />
    )
    let dialog = screen.getByRole('dialog', { name: /new workspace/i })
    await user.type(within(dialog).getByPlaceholderText(/e.g. Research Project/i), 'Draft')
    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(<WorkspaceDialog open={false} onOpenChange={onOpenChange} onSave={vi.fn()} />)
    rerender(<WorkspaceDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />)
    dialog = screen.getByRole('dialog', { name: /new workspace/i })
    expect(within(dialog).getByPlaceholderText(/e.g. Research Project/i)).toHaveValue('')
  })

  it('updates an existing workspace when the name changes', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSave = vi.fn()
    const workspace = {
      id: 'w1',
      name: 'Old',
      description: 'd',
      customSystemPrompt: 'p',
      createdAt: Date.now(),
    }
    render(
      <WorkspaceDialog open onOpenChange={vi.fn()} workspace={workspace} onSave={onSave} />
    )
    const dialog = screen.getByRole('dialog', { name: /edit workspace/i })
    const nameInput = within(dialog).getByDisplayValue('Old')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed')
    await user.click(within(dialog).getByRole('button', { name: /Save Changes/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w1',
        name: 'Renamed',
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
