import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const executeWebSearch = vi.fn()
const generateFollowUpQuestions = vi.fn()
const executeModelCouncil = vi.fn()
const callLlm = vi.fn()

vi.mock('@/lib/api', () => ({
  executeWebSearch: (...a: unknown[]) => executeWebSearch(...a),
  generateFollowUpQuestions: (...a: unknown[]) => generateFollowUpQuestions(...a),
  executeModelCouncil: (...a: unknown[]) => executeModelCouncil(...a),
}))

vi.mock('@/lib/llm', () => ({
  callLlm: (...a: unknown[]) => callLlm(...a),
}))

import { MainApp } from './App'
import App from './App'

describe('MainApp', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    vi.clearAllMocks()
    localStorage.clear()
    executeWebSearch.mockResolvedValue([])
    generateFollowUpQuestions.mockResolvedValue([])
    callLlm.mockResolvedValue('Assistant reply text')
    executeModelCouncil.mockResolvedValue({
      models: [
        {
          model: 'gpt-4o',
          content: 'A',
          generatedAt: Date.now(),
        },
      ],
      convergence: { score: 85 },
    })
  })

  it('runs a query from the empty state example and shows the assistant reply', async () => {
    const user = userEvent.setup()
    render(<MainApp />)
    await user.click(
      screen.getByRole('button', {
        name: /Explain quantum computing in simple terms/i,
      })
    )
    await waitFor(() => {
      expect(screen.getByText('Assistant reply text')).toBeInTheDocument()
    })
    expect(executeWebSearch).toHaveBeenCalled()
    expect(callLlm).toHaveBeenCalled()
  })

  it('includes web search snippets in the LLM prompt when Tavily returns sources', async () => {
    const user = userEvent.setup()
    executeWebSearch.mockResolvedValue([
      { title: 'Example Source', url: 'https://example.com/doc', snippet: 'A snippet.' },
    ])
    render(<MainApp />)
    await user.click(
      screen.getAllByRole('button', {
        name: /Explain quantum computing in simple terms/i,
      })[0]
    )
    await waitFor(() => {
      expect(callLlm).toHaveBeenCalled()
    })
    const prompt = String(callLlm.mock.calls[0][0])
    expect(prompt).toContain('Web Search Results')
    expect(prompt).toContain('[1] Example Source')
    expect(prompt).toContain('https://example.com/doc')
  })

  it('shows workspace detail after selecting a workspace in the sidebar', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'workspaces',
      JSON.stringify([
        {
          id: 'w1',
          name: 'Lab Space',
          description: 'Lab description',
          customSystemPrompt: 'Be concise',
          createdAt: 1,
        },
      ])
    )
    render(<MainApp />)
    await user.click(screen.getAllByRole('button', { name: /^Lab Space$/i })[0])
    expect(screen.getByRole('heading', { name: 'Lab Space' })).toBeInTheDocument()
    expect(screen.getByText('Lab description')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/Ask a question in Lab Space/i)
    ).toBeInTheDocument()
  })

  it('opens the settings dialog from the sidebar', async () => {
    const user = userEvent.setup()
    render(<MainApp />)
    await user.click(screen.getAllByRole('button', { name: /Settings/i })[0])
    expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument()
  })

  it('toggles sidebar collapse from the header control', () => {
    render(<MainApp />)
    const title = screen.getByRole('heading', { name: /AI Search/i })
    const collapseToggle = title.nextElementSibling as HTMLButtonElement
    expect(collapseToggle).toBeInstanceOf(HTMLButtonElement)
    fireEvent.click(collapseToggle)
    expect(screen.queryByRole('heading', { name: /AI Search/i })).not.toBeInTheDocument()
    const narrowSidebar = document.querySelector('.w-16')
    const expandToggle = narrowSidebar?.querySelector('button')
    expect(expandToggle).toBeInstanceOf(HTMLButtonElement)
    fireEvent.click(expandToggle as HTMLButtonElement)
    expect(screen.getByRole('heading', { name: /AI Search/i })).toBeInTheDocument()
  })

  it('runs a follow-up question from an existing thread', async () => {
    localStorage.setItem(
      'threads',
      JSON.stringify([
        {
          id: 't-follow',
          title: 'Thread A',
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: 'u1',
              role: 'user',
              content: 'First',
              createdAt: 1,
            },
            {
              id: 'a1',
              role: 'assistant',
              content: 'Answer text',
              createdAt: 2,
              followUpQuestions: ['Follow-up one?'],
            },
          ],
        },
      ])
    )
    render(<MainApp />)
    fireEvent.click(screen.getAllByRole('button', { name: /Thread A/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /Follow-up one\?/i }))
    await waitFor(() => {
      expect(executeWebSearch).toHaveBeenCalled()
    })
  })

})

describe('App', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('renders MainApp on the default route', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.getAllByText('AI Search').length).toBeGreaterThan(0)
  })

  it('renders OAuth callback on /oauth/callback', () => {
    window.history.pushState({}, '', '/oauth/callback?error=access_denied')
    render(<App />)
    expect(screen.getAllByText(/Authorization Failed/i).length).toBeGreaterThan(0)
  })
})
