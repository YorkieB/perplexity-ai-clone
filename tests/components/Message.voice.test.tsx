/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Message } from '@/components/Message'

describe('Message voice label', () => {
  it('shows Voice chip for modality voice', () => {
    render(
      <Message
        message={{
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: Date.now(),
          modality: 'voice',
          source: 'voice',
          voiceTurn: { source: 'voice' },
        }}
      />
    )
    expect(screen.getByText('Voice')).toBeTruthy()
  })

  it('shows interrupted marker when voiceTurn.interrupted', () => {
    render(
      <Message
        message={{
          id: '2',
          role: 'assistant',
          content: 'Partial',
          createdAt: Date.now(),
          modality: 'voice',
          source: 'voice',
          voiceTurn: { source: 'voice', interrupted: true },
        }}
      />
    )
    expect(screen.getByText(/interrupted/i)).toBeTruthy()
  })
})
