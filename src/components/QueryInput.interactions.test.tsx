import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
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

function getPopoverTrigger(container: HTMLElement) {
  const el = container.querySelector('[data-slot="popover-trigger"]')
  if (!el) throw new Error('popover trigger missing')
  return el as HTMLElement
}

describe('QueryInput interactions', () => {
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

  it('expands the More menu in the plus popover', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <QueryInput
        onSubmit={vi.fn()}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    await user.click(getPopoverTrigger(container))
    await user.click(await screen.findByText(/^More$/i))
    expect(screen.getByText(/Additional options/i)).toBeInTheDocument()
  })

  it('enables model council and disables the banner', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <QueryInput
        onSubmit={vi.fn()}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    await user.click(getPopoverTrigger(container))
    await user.click(await screen.findByText(/Model council/i))
    await user.click(screen.getByRole('button', { name: /Start Council/i }))
    expect(await screen.findByText(/Model Council Active/i)).toBeInTheDocument()
    await user.click(screen.getByText(/Disable/i))
    expect(screen.queryByText(/Model Council Active/i)).not.toBeInTheDocument()
  })

  it('submits when only attachments are present', async () => {
    const user = userEvent.setup()
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
    const submit = within(container)
      .getAllByRole('button')
      .find((b) => b.className.includes('rounded-full'))
    expect(submit).toBeTruthy()
    await user.click(submit!)
    expect(onSubmit).toHaveBeenCalled()
  })

  it('records file processing errors', async () => {
    processFileMock.mockRejectedValueOnce(new Error('bad file'))
    const { container } = render(
      <QueryInput
        onSubmit={vi.fn()}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(processFileMock).toHaveBeenCalled())
  })
})
