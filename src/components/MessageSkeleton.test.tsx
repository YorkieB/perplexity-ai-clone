import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageSkeleton } from './MessageSkeleton'

describe('MessageSkeleton', () => {
  it('renders skeleton placeholders', () => {
    const { container } = render(<MessageSkeleton />)
    expect(container.querySelectorAll('.animate-pulse, [class*="Skeleton"]').length).toBeGreaterThan(0)
  })
})
