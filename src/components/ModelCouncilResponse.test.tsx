import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ModelCouncilResponse } from './ModelCouncilResponse'

describe('ModelCouncilResponse', () => {
  const responses = [
    {
      model: 'gpt-4o',
      content: 'First answer',
      generatedAt: Date.now(),
      responseTime: 500,
      tokenCount: 1200,
    },
    {
      model: 'claude-3.5-sonnet',
      content: 'Second [1]',
      generatedAt: Date.now(),
      responseTime: 1500,
      tokenCount: 2400,
    },
  ]

  it('renders overview, convergence, and export', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(
      <ModelCouncilResponse
        modelResponses={responses}
        convergenceScore={85}
        commonThemes={['theme']}
        divergentPoints={['diff']}
        onCitationHover={vi.fn()}
      />
    )

    expect(screen.getByText(/85% convergence/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Export Report/i }))
    expect(createObjectURL).toHaveBeenCalled()

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('opens side-by-side comparison', async () => {
    const user = userEvent.setup()
    render(
      <ModelCouncilResponse modelResponses={responses} convergenceScore={40} />
    )
    await user.click(
      screen.getAllByRole('button', { name: /Show Side-by-Side Comparison/i })[0]
    )
    expect(
      screen.getAllByRole('button', { name: /Hide Side-by-Side Comparison/i })[0]
    ).toBeInTheDocument()
  })
})
