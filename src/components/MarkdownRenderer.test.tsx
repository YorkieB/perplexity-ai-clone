import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { toast } from 'sonner'

import { MarkdownRenderer } from './MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('renders plain text from markdown', () => {
    const onHover = vi.fn()
    render(<MarkdownRenderer content="Hello **world**" onCitationHover={onHover} />)
    expect(screen.getByText('world')).toBeInTheDocument()
  })

  it('turns citation markers into interactive superscripts', async () => {
    const user = userEvent.setup()
    const onHover = vi.fn()
    render(<MarkdownRenderer content="See [1] for more." onCitationHover={onHover} />)
    const sup = screen.getByText('1', { selector: 'sup' })
    await user.click(sup)
    expect(onHover).toHaveBeenCalledWith(1)
  })

  it('copies code block via clipboard when copy succeeds', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)

    const md = '```js\nconsole.log(1)\n```'
    render(<MarkdownRenderer content={md} onCitationHover={vi.fn()} />)
    const copyBtn = screen.getAllByRole('button')
    await user.click(copyBtn[0])
    expect(writeText).toHaveBeenCalledWith('console.log(1)\n')

    vi.restoreAllMocks()
  })

  it('shows an error toast when code copy fails', async () => {
    const user = userEvent.setup()
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('')
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    const md = '```js\nx\n```'
    render(<MarkdownRenderer content={md} onCitationHover={vi.fn()} />)
    const copyBtn = screen.getAllByRole('button')[0]
    await user.click(copyBtn)
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled()
    })
    toastError.mockRestore()
  })
})
