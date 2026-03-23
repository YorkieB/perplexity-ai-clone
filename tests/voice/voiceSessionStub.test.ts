import { describe, expect, it, vi } from 'vitest'
import { NullVoiceSession } from '@/lib/voice/voiceSession'

describe('NullVoiceSession', () => {
  it('connect and disconnect are safe no-ops', async () => {
    const s = new NullVoiceSession()
    await expect(Promise.resolve(s.connect())).resolves.toBeUndefined()
    expect(() => s.disconnect()).not.toThrow()
  })

  it('on/off handlers do not run', () => {
    const s = new NullVoiceSession()
    const fn = vi.fn()
    s.on('state_changed', fn)
    s.connect()
    expect(fn).not.toHaveBeenCalled()
    s.off('state_changed', fn)
  })

  it('sendAudioChunk and abortAssistant are safe', () => {
    const s = new NullVoiceSession()
    expect(() => s.sendAudioChunk?.(new Uint8Array(4))).not.toThrow()
    expect(() => s.abortAssistant?.()).not.toThrow()
  })
})
