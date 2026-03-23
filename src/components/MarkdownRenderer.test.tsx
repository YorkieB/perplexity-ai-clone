import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
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
})
