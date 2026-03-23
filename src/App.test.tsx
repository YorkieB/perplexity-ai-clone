import { render, screen, waitFor } from '@testing-library/react'
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

})

describe('App', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('renders OAuth callback on /oauth/callback', () => {
    window.history.pushState({}, '', '/oauth/callback?error=access_denied')
    render(<App />)
    expect(screen.getAllByText(/Authorization Failed/i).length).toBeGreaterThan(0)
  })
})
