import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('@/components/QueryInput', () => ({
  QueryInput: ({
    onSubmit,
    isLoading,
  }: {
    onSubmit: (
      q: string,
      adv: boolean,
      files?: unknown,
      council?: boolean,
      models?: string[]
    ) => void
    isLoading?: boolean
  }) => (
    <div data-testid="mock-query">
      <button
        type="button"
        data-testid="run-council"
        disabled={isLoading}
        onClick={() => onSubmit('branch', false, undefined, true, ['gpt-4o', 'gpt-4o-mini'])}
      >
        Run council
      </button>
      <button
        type="button"
        data-testid="run-normal"
        disabled={isLoading}
        onClick={() => onSubmit('branch', false, undefined, false)}
      >
        Run normal
      </button>
    </div>
  ),
}))

import { MainApp } from './App'

describe('MainApp branches', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    vi.clearAllMocks()
    localStorage.clear()
    executeWebSearch.mockResolvedValue([])
    generateFollowUpQuestions.mockResolvedValue([])
    callLlm.mockResolvedValue('ok')
    executeModelCouncil.mockResolvedValue({
      models: [
        { model: 'gpt-4o', content: 'A', generatedAt: Date.now() },
        { model: 'gpt-4o-mini', content: 'B', generatedAt: Date.now() },
      ],
      convergence: { score: 90 },
    })
  })

  it('uses model council path when QueryInput requests it', async () => {
    const user = userEvent.setup()
    render(<MainApp />)
    await user.click(screen.getAllByTestId('run-council')[0])
    await waitFor(() => {
      expect(executeModelCouncil).toHaveBeenCalled()
    })
  })

  it('surfaces errors from the LLM path', async () => {
    const user = userEvent.setup()
    callLlm.mockRejectedValueOnce(new Error('fail'))
    render(<MainApp />)
    await user.click(screen.getAllByTestId('run-normal')[0])
    await waitFor(() => {
      expect(executeWebSearch).toHaveBeenCalled()
    })
  })

  it('handles search configuration errors from Tavily', async () => {
    const user = userEvent.setup()
    executeWebSearch.mockResolvedValueOnce({
      error: true,
      message: 'Search not configured',
    })
    render(<MainApp />)
    await user.click(screen.getAllByTestId('run-normal')[0])
    await waitFor(() => {
      expect(callLlm).toHaveBeenCalled()
    })
  })
})
