import { describe, expect, it } from 'vitest'
import { VOICE_MAX_SESSION_MS, VOICE_START_COOLDOWN_MS } from '@/lib/voice/voiceLimits'

describe('voiceLimits', () => {
  it('exports positive finite durations', () => {
    expect(VOICE_START_COOLDOWN_MS).toBeGreaterThan(0)
    expect(VOICE_MAX_SESSION_MS).toBeGreaterThan(VOICE_START_COOLDOWN_MS)
    expect(Number.isFinite(VOICE_MAX_SESSION_MS)).toBe(true)
  })
})
