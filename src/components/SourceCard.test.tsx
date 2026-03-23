import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SourceCard } from './SourceCard'

describe('SourceCard', () => {
  it('renders title, domain, and link href for a valid URL', () => {
    render(
      <SourceCard
        source={{ title: 'Example', url: 'https://www.example.com/path', snippet: '' }}
        index={1}
      />
    )
    const link = screen.getByRole('link', { name: /Example/i })
    expect(link).toHaveAttribute('href', 'https://www.example.com/path')
    expect(screen.getByText('example.com')).toBeInTheDocument()
  })

  it('falls back when URL parsing fails for domain and favicon', () => {
    render(
      <SourceCard source={{ title: 'Bad', url: 'not-a-valid-url', snippet: '' }} index={2} isHighlighted />
    )
    expect(screen.getByText('not-a-valid-url')).toBeInTheDocument()
    const imgs = screen.queryAllByRole('img')
    expect(imgs.length).toBe(0)
  })

  it('hides favicon image on load error', () => {
    const { container } = render(
      <SourceCard
        source={{ title: 'Site', url: 'https://example.org', snippet: '' }}
        index={3}
      />
    )
    const img = container.querySelector('img') as HTMLImageElement
    fireEvent.error(img)
    expect(img.style.display).toBe('none')
  })
})
