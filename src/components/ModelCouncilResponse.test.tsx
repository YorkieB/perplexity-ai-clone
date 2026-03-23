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

  it('covers convergence copy tiers and analysis tab', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const two = [
      { model: 'gpt-4o-mini', content: 'a', generatedAt: 1 },
      { model: 'custom-unknown-model', content: 'b', generatedAt: 1 },
    ]

    const { rerender } = render(
      <ModelCouncilResponse modelResponses={two} convergenceScore={85} commonThemes={['t']} divergentPoints={['d']} />
    )
    expect(screen.getAllByText(/strong agreement/i).length).toBeGreaterThan(0)

    rerender(
      <ModelCouncilResponse modelResponses={two} convergenceScore={60} commonThemes={['t']} divergentPoints={['d']} />
    )
    expect(screen.getAllByText(/generally agree/i).length).toBeGreaterThan(0)

    rerender(
      <ModelCouncilResponse modelResponses={two} convergenceScore={40} commonThemes={['t']} divergentPoints={['d']} />
    )
    expect(screen.getAllByText(/notably different perspectives/i).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('tab', { name: /^Analysis$/i })[0])
    await user.click(screen.getAllByRole('button', { name: /Export Report/i })[0])
  })
})
