import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryInput } from './QueryInput'

const processFileMock = vi.fn()

vi.mock('@/lib/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/helpers')>()
  return {
    ...actual,
    processFile: (...args: unknown[]) => processFileMock(...args),
  }
})

function getQueryTextarea(container: HTMLElement) {
  return within(container).getByRole('textbox')
}

describe('QueryInput', () => {
  beforeEach(() => {
    processFileMock.mockResolvedValue({
      id: 'f1',
      name: 't.txt',
      type: 'text/plain',
      size: 4,
      content: 'body',
      uploadedAt: Date.now(),
    })
  })

  it('submits trimmed query on Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container } = render(
      <QueryInput
        onSubmit={onSubmit}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    const ta = getQueryTextarea(container)
    await user.type(ta, '  hi  ')
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('hi', false, undefined, false, undefined)
  })

  it('shows suggestions when typing / in an empty field', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <QueryInput
        onSubmit={vi.fn()}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    await user.type(getQueryTextarea(container), '/')
    expect(screen.getByText(/Show suggestions/i)).toBeInTheDocument()
  })

  it('processes file upload', async () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <QueryInput
        onSubmit={onSubmit}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(processFileMock).toHaveBeenCalled())
  })

  it('toggles advanced analysis', async () => {
    const user = userEvent.setup()
    const onAdvancedModeChange = vi.fn()
    const { container } = render(
      <QueryInput
        onSubmit={vi.fn()}
        advancedMode={false}
        onAdvancedModeChange={onAdvancedModeChange}
      />
    )
    await user.click(within(container).getByRole('switch'))
    expect(onAdvancedModeChange).toHaveBeenCalledWith(true)
  })

  it('disables input while loading', () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <QueryInput
        onSubmit={onSubmit}
        isLoading
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    expect(getQueryTextarea(container)).toBeDisabled()
  })
})
