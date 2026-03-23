import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { QueryInput } from './QueryInput'

const processFileMock = vi.fn()

vi.mock('@/lib/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/helpers')>()
  return {
    ...actual,
    processFile: (...args: unknown[]) => processFileMock(...args),
  }
})

function getPlusTrigger(container: HTMLElement) {
  const el = container.querySelector('[data-slot="popover-trigger"]')
  if (!el) throw new Error('popover trigger missing')
  return el as HTMLElement
}

describe('QueryInput full coverage', () => {
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

  it('clicks stub menu entries (connectors, deep research, create files, learn)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    await user.click(getPlusTrigger(container))
    await user.click(await screen.findByText(/Connectors and sources/i))
    await user.click(await screen.findByText(/Deep research/i))
    await user.click(await screen.findByText(/Create files and apps/i))
    await user.click(await screen.findByText(/Learn step by step/i))
  })

  it('opens cloud browser from the plus menu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    await user.click(getPlusTrigger(container))
    await user.click(await screen.findByText(/Add files from cloud/i))
    expect(await screen.findByRole('dialog', { name: /Import from Cloud Storage/i })).toBeInTheDocument()
  })

  it('uploads multiple files and shows plural toast', async () => {
    const toastSuccess = vi.spyOn(toast, 'success').mockReturnValue('')
    processFileMock
      .mockResolvedValueOnce({
        id: 'a',
        name: 'a.txt',
        type: 'text/plain',
        size: 1,
        content: 'a',
        uploadedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        id: 'b',
        name: 'b.txt',
        type: 'text/plain',
        size: 1,
        content: 'b',
        uploadedAt: Date.now(),
      })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' })
    const f2 = new File(['b'], 'b.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [f1, f2] } })
    await waitFor(() => {
      expect(toastSuccess.mock.calls.some((c) => String(c[0]).includes('files uploaded'))).toBe(true)
    })
    toastSuccess.mockRestore()
  })

  it('surfaces non-Error failures from processFile', async () => {
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('')
    processFileMock.mockRejectedValueOnce('bad')
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    toastError.mockRestore()
  })

  it('changes model from the select', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    const trigger = within(container).getByRole('combobox')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /GPT-4o$/i }))
  })

  it('grows textarea height when query changes (auto-resize effect)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    const ta = within(container).getByRole('textbox') as HTMLTextAreaElement
    await user.type(ta, 'a'.repeat(80))
    expect(ta.value.length).toBe(80)
    expect(ta.style.height).toMatch(/px$/)
  })

  it('opens and closes file preview from an attachment', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    })
    await waitFor(() => expect(screen.getByText('t.txt')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /t\.txt/i }))
    const dlg = screen.getAllByRole('dialog')[0]
    await user.click(within(dlg).getAllByRole('button', { name: /^Close$/i }).pop()!)
  })

  it('opens file analysis dialog from analyze control', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { container } = render(
      <QueryInput onSubmit={vi.fn()} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    })
    await waitFor(() =>
      expect(screen.getAllByTitle('Analyze with AI').length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByTitle('Analyze with AI')[0])
    const dlg = screen.getAllByRole('dialog')[0]
    expect(within(dlg).getByRole('heading', { name: /AI File Analysis/i })).toBeInTheDocument()
  })

  it('confirms model council and enables council mode', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSubmit = vi.fn()
    const { container } = render(
      <QueryInput onSubmit={onSubmit} advancedMode={false} onAdvancedModeChange={vi.fn()} />
    )
    await user.click(getPlusTrigger(container))
    await user.click(await screen.findByText(/Model council/i))
    await user.click(screen.getByRole('button', { name: /Start Council/i }))
    expect(await screen.findByText(/Model Council Active/i)).toBeInTheDocument()
    const ta = within(container).getByRole('textbox')
    await user.type(ta, 'q')
    const submit = within(container)
      .getAllByRole('button')
      .find((b) => b.className.includes('rounded-full'))
    await user.click(submit!)
    expect(onSubmit).toHaveBeenCalled()
    const call = onSubmit.mock.calls[0]
    expect(call[3]).toBe(true)
  })
})
