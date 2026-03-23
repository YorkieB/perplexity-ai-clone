import { describe, expect, it } from 'vitest'
import {
  defaultRealtimeSessionBody,
  mergeRealtimeSessionBody,
} from '@/lib/voice/realtimeSessionDefaults'

describe('mergeRealtimeSessionBody', () => {
  it('returns defaults for empty body', () => {
    expect(mergeRealtimeSessionBody('')).toEqual(defaultRealtimeSessionBody)
  })

  it('merges partial session fields over defaults', () => {
    const merged = mergeRealtimeSessionBody(
      JSON.stringify({
        session: {
          model: 'gpt-realtime-mini',
        },
      })
    )
    expect(merged.session.model).toBe('gpt-realtime-mini')
    expect(merged.session.type).toBe('realtime')
    expect(merged.session.audio?.output?.voice).toBe('marin')
  })

  it('falls back to defaults on invalid JSON', () => {
    expect(mergeRealtimeSessionBody('not json')).toEqual(defaultRealtimeSessionBody)
  })
})
