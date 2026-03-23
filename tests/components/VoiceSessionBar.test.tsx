/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceSessionBar } from '@/components/VoiceSessionBar'
import type { VoiceSessionContextValue } from '@/contexts/VoiceSessionContext'
import { useVoiceSession } from '@/contexts/VoiceSessionContext'

vi.mock('@/contexts/VoiceSessionContext', () => ({
  useVoiceSession: vi.fn(),
}))

const baseCtx: VoiceSessionContextValue = {
  voiceState: 'listening',
  isVoiceConnected: true,
  isVoiceConnecting: false,
  voiceInputMode: 'open',
  setVoiceInputMode: vi.fn(),
  pttActive: false,
  setPttActive: vi.fn(),
  startVoice: vi.fn(),
  stopVoice: vi.fn(),
  retryVoice: vi.fn(),
}

describe('VoiceSessionBar', () => {
  it('renders voice state and end button when connected', () => {
    vi.mocked(useVoiceSession).mockReturnValue(baseCtx)
    render(<VoiceSessionBar />)
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/Voice:/i)
    expect(status.textContent).toMatch(/Listening/i)
    expect(screen.getByRole('button', { name: /end voice session/i })).toBeTruthy()
  })

  it('returns null when voice is inactive', () => {
    vi.mocked(useVoiceSession).mockReturnValue({
      ...baseCtx,
      isVoiceConnected: false,
      isVoiceConnecting: false,
      voiceState: 'idle',
    })
    const { container } = render(<VoiceSessionBar />)
    expect(container.firstChild).toBeNull()
  })
})
