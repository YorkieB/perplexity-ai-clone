/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryInput } from '@/components/QueryInput'
import type { VoiceSessionContextValue } from '@/contexts/VoiceSessionContext'
import { useVoiceSession } from '@/contexts/VoiceSessionContext'

vi.mock('@/contexts/VoiceSessionContext', () => ({
  useVoiceSession: vi.fn(),
}))

const idleVoice: VoiceSessionContextValue = {
  voiceState: 'idle',
  isVoiceConnected: false,
  isVoiceConnecting: false,
  voiceInputMode: 'open',
  setVoiceInputMode: vi.fn(),
  pttActive: false,
  setPttActive: vi.fn(),
  startVoice: vi.fn(),
  stopVoice: vi.fn(),
  retryVoice: vi.fn(),
}

describe('QueryInput voice control', () => {
  it('exposes start/stop voice control with accessible name', () => {
    vi.mocked(useVoiceSession).mockReturnValue(idleVoice)
    render(
      <QueryInput
        onSubmit={vi.fn()}
        isLoading={false}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /start voice conversation/i })).toBeTruthy()
  })

  it('shows stop label when voice is active', () => {
    vi.mocked(useVoiceSession).mockReturnValue({
      ...idleVoice,
      isVoiceConnected: true,
      voiceState: 'listening',
    })
    render(
      <QueryInput
        onSubmit={vi.fn()}
        isLoading={false}
        advancedMode={false}
        onAdvancedModeChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /stop voice session/i })).toBeTruthy()
  })
})
