import { describe, expect, it } from 'vitest'
import { VoiceRealtimeError } from '@/lib/voice/errors'
import { isVoiceRealtimeError, toastBodyForVoiceError, voiceCopy } from '@/lib/voice/uxCopy'

describe('isVoiceRealtimeError', () => {
  it('returns true for VoiceRealtimeError instances', () => {
    expect(isVoiceRealtimeError(new VoiceRealtimeError('USER_MEDIA_DENIED', 'x'))).toBe(true)
  })

  it('returns false for generic Error', () => {
    expect(isVoiceRealtimeError(new Error('x'))).toBe(false)
  })

  it('returns false for non-errors', () => {
    expect(isVoiceRealtimeError(null)).toBe(false)
    expect(isVoiceRealtimeError('string')).toBe(false)
  })
})

describe('toastBodyForVoiceError', () => {
  it('maps USER_MEDIA_DENIED', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('USER_MEDIA_DENIED', 'detail'))
    expect(r.title).toBe(voiceCopy.micDeniedTitle)
    expect(r.description).toBe(voiceCopy.micDeniedDescription)
  })

  it('maps SESSION_RATE_LIMITED', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('SESSION_RATE_LIMITED', 'slow down'))
    expect(r.title).toBe(voiceCopy.sessionRateLimitedTitle)
    expect(r.description).toBe(voiceCopy.sessionRateLimitedDescription)
  })

  it('maps SESSION_BOOTSTRAP_FAILED', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('SESSION_BOOTSTRAP_FAILED', 'http 500'))
    expect(r.title).toBe(voiceCopy.sessionBootstrapFailedTitle)
    expect(r.description).toBe(voiceCopy.sessionBootstrapFailedDescription)
  })

  it('maps CONNECTION_LOST', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('CONNECTION_LOST', 'gone'))
    expect(r.title).toBe(voiceCopy.connectionLostTitle)
    expect(r.description).toBe(voiceCopy.connectionLostDescription)
  })

  it('maps NOT_SUPPORTED with message as description', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('NOT_SUPPORTED', 'no webrtc'))
    expect(r.title).toBe(voiceCopy.sessionBootstrapFailedTitle)
    expect(r.description).toBe('no webrtc')
  })

  it('maps unknown VoiceRealtimeError code to generic title + message', () => {
    const r = toastBodyForVoiceError(new VoiceRealtimeError('DATA_CHANNEL_FAILED', 'dc broke'))
    expect(r.title).toBe(voiceCopy.realtimeApiErrorTitle)
    expect(r.description).toBe('dc broke')
  })

  it('maps plain Error', () => {
    const r = toastBodyForVoiceError(new Error('server said no'))
    expect(r.title).toBe(voiceCopy.realtimeApiErrorTitle)
    expect(r.description).toBe('server said no')
  })

  it('maps unknown values to fallback description', () => {
    const r = toastBodyForVoiceError(undefined)
    expect(r.title).toBe(voiceCopy.realtimeApiErrorTitle)
    expect(r.description).toBe(voiceCopy.sessionBootstrapFailedDescription)
  })
})
