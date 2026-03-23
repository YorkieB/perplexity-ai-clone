/** @vitest-environment happy-dom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'

function stubWebRtcGlobals() {
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn().mockImplementation(() => ({
      onconnectionstatechange: null,
      ontrack: null,
      close: vi.fn(),
      createDataChannel: vi.fn(),
      createOffer: vi.fn(),
      setLocalDescription: vi.fn(),
      setRemoteDescription: vi.fn(),
      addTrack: vi.fn(),
    }))
  )
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }],
      }),
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OpenAIRealtimeVoiceSession bootstrap', () => {
  it('throws SESSION_RATE_LIMITED when client_secrets returns 429', async () => {
    stubWebRtcGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({
            error: { message: 'Too many requests' },
          }),
      })
    )
    const s = new OpenAIRealtimeVoiceSession({ sessionUrl: '/api/realtime/session' })
    await expect(s.connect()).rejects.toMatchObject({
      code: 'SESSION_RATE_LIMITED',
    })
  })

  it('throws MISSING_EPHEMERAL_KEY when response has no ephemeral value', async () => {
    stubWebRtcGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      })
    )
    const s = new OpenAIRealtimeVoiceSession()
    await expect(s.connect()).rejects.toMatchObject({
      code: 'MISSING_EPHEMERAL_KEY',
    })
  })
})
