import { describe, expect, it } from '@jest/globals'

import { classifyScreenIntent } from '../screen-intent-classifier'

describe('classifyScreenIntent', () => {
  it('maps "watch my screen" → screen.watch', () => {
    expect(classifyScreenIntent('watch my screen')).toEqual({ intent: 'screen.watch', entities: {} })
  })

  it('maps "monitor my screen" → screen.watch', () => {
    expect(classifyScreenIntent('monitor my screen')).toEqual({ intent: 'screen.watch', entities: {} })
  })

  it('maps "advise me" → screen.advise', () => {
    expect(classifyScreenIntent('advise me')).toEqual({ intent: 'screen.advise', entities: {} })
  })

  it('maps "coach me on this" → screen.advise', () => {
    expect(classifyScreenIntent('coach me on this')).toEqual({ intent: 'screen.advise', entities: {} })
  })

  it('maps "stop watching" → screen.stop', () => {
    expect(classifyScreenIntent('stop watching')).toEqual({ intent: 'screen.stop', entities: {} })
  })

  it('maps "screen off" → screen.stop', () => {
    expect(classifyScreenIntent('screen off')).toEqual({ intent: 'screen.stop', entities: {} })
  })

  it('maps "open chrome for me" → screen.act with full transcript as goal', () => {
    const s = 'open chrome for me'
    expect(classifyScreenIntent(s)).toEqual({ intent: 'screen.act', entities: { goal: s } })
  })

  it('maps "what mode are you in" → screen.status', () => {
    expect(classifyScreenIntent('what mode are you in')).toEqual({ intent: 'screen.status', entities: {} })
  })

  it('returns null for unrelated transcript', () => {
    expect(classifyScreenIntent('tell me the weather')).toBeNull()
  })

  it('is case-insensitive for "WATCH MY SCREEN" → screen.watch', () => {
    expect(classifyScreenIntent('WATCH MY SCREEN')).toEqual({ intent: 'screen.watch', entities: {} })
  })
})
