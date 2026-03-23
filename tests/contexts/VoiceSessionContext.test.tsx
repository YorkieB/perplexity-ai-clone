/** @vitest-environment happy-dom */
import type { ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'
import { VoiceSessionProvider, useVoiceSession } from '@/contexts/VoiceSessionContext'

const sessionMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  setMicrophoneEnabled: vi.fn(),
}))

vi.mock('@/lib/voice/openaiRealtimeVoiceSession', () => ({
  OpenAIRealtimeVoiceSession: vi.fn(() => ({
    connect: sessionMocks.connect,
    disconnect: sessionMocks.disconnect,
    on: sessionMocks.on,
    off: sessionMocks.off,
    setMicrophoneEnabled: sessionMocks.setMicrophoneEnabled,
  })),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <VoiceSessionProvider onUserTranscript={vi.fn()} onAssistantTranscript={vi.fn()}>
      {children}
    </VoiceSessionProvider>
  )
}

describe('VoiceSessionProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    sessionMocks.connect.mockResolvedValue(undefined)
  })

  it('startVoice creates session and calls connect', async () => {
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startVoice()
    })
    expect(vi.mocked(OpenAIRealtimeVoiceSession)).toHaveBeenCalled()
    expect(sessionMocks.connect).toHaveBeenCalled()
  })

  it('stopVoice calls disconnect on the session', async () => {
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startVoice()
    })
    act(() => {
      result.current.stopVoice()
    })
    expect(sessionMocks.disconnect).toHaveBeenCalled()
  })

  it('exposes voiceInputMode default open', () => {
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    expect(result.current.voiceInputMode).toBe('open')
  })
})
