import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DeepResearchIndicator } from './DeepResearchIndicator'

describe('DeepResearchIndicator', () => {
  it('returns null when not active', () => {
    const { container } = render(
      <DeepResearchIndicator isActive={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows in-progress state with optional search count', () => {
    render(<DeepResearchIndicator isActive searchCount={2} />)
    expect(screen.getByText(/Deep Research in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/\(2 searches so far\)/)).toBeInTheDocument()
  })

  it('shows complete state with optional search count', () => {
    render(<DeepResearchIndicator isActive isComplete searchCount={3} />)
    expect(screen.getByText(/Deep Research Complete/i)).toBeInTheDocument()
    expect(screen.getByText(/\(3 searches\)/)).toBeInTheDocument()
  })
})
