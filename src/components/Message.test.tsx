import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Message } from './Message'
import type { Message as Msg } from '@/lib/types'

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div data-testid="markdown-renderer">md</div>,
}))

vi.mock('./ModelCouncilResponse', () => ({
  ModelCouncilResponse: () => <div data-testid="council">council</div>,
}))

vi.mock('./FilePreviewModal', () => ({
  FilePreviewModal: () => null,
}))

describe('Message', () => {
  it('renders user content', () => {
    const message: Msg = {
      id: '1',
      role: 'user',
      content: 'Hello',
      createdAt: Date.now(),
    }
    render(<Message message={message} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders assistant markdown path', () => {
    const message: Msg = {
      id: '2',
      role: 'assistant',
      content: 'Answer',
      createdAt: Date.now(),
    }
    render(<Message message={message} />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
  })

  it('renders model council path', () => {
    const message: Msg = {
      id: '3',
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      isModelCouncil: true,
      modelResponses: [
        {
          model: 'gpt-4o',
          content: 'A',
          generatedAt: Date.now(),
          convergenceScore: 90,
        },
      ],
    }
    render(<Message message={message} />)
    expect(screen.getByTestId('council')).toBeInTheDocument()
  })

  it('shows sources and follow-ups when provided', async () => {
    const user = userEvent.setup()
    const onFollowUp = vi.fn()
    const message: Msg = {
      id: '4',
      role: 'assistant',
      content: 'Text with [1]',
      createdAt: Date.now(),
      sources: [{ title: 'S', url: 'https://example.com', snippet: '' }],
      followUpQuestions: ['Next?'],
    }
    render(<Message message={message} onFollowUpClick={onFollowUp} />)
    expect(screen.getByText('example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Next\?/i }))
    expect(onFollowUp).toHaveBeenCalledWith('Next?')
  })
})
