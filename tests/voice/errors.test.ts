import { describe, expect, it } from 'vitest'
import { VoiceRealtimeError, type VoiceRealtimeErrorCode } from '@/lib/voice/errors'

describe('VoiceRealtimeError', () => {
  it('exposes code and message', () => {
    const e = new VoiceRealtimeError('USER_MEDIA_DENIED', 'blocked')
    expect(e.code).toBe('USER_MEDIA_DENIED')
    expect(e.message).toBe('blocked')
    expect(e.name).toBe('VoiceRealtimeError')
  })

  it('supports optional cause', () => {
    const inner = new Error('inner')
    const e = new VoiceRealtimeError('CONNECTION_LOST', 'dropped', { cause: inner })
    expect((e as Error & { cause?: unknown }).cause).toBe(inner)
  })

  it('codes union includes transport and rate limit', () => {
    const codes: VoiceRealtimeErrorCode[] = [
      'SESSION_BOOTSTRAP_FAILED',
      'SESSION_RATE_LIMITED',
      'CONNECTION_LOST',
      'USER_MEDIA_DENIED',
    ]
    expect(codes.length).toBeGreaterThan(0)
  })
})
