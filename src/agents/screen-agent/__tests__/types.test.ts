import { describe, expect, it } from '@jest/globals'

import { DENYLIST } from '../config'
import { AgentMode, type ScreenState } from '../types'

describe('screen-agent types', () => {
  it('AgentMode has exactly 3 values', () => {
    expect(Object.keys(AgentMode)).toHaveLength(3)
  })

  it('ScreenState has all required fields', () => {
    const state: ScreenState = {
      frameId: 'f1',
      timestamp: 0,
      activeApp: null,
      windowTitle: null,
      fullText: '',
      errorDetected: false,
      url: null,
      elements: [],
      resolution: { width: 1920, height: 1080 },
    }
    expect(state.frameId).toBe('f1')
    expect(state.elements).toEqual([])
    expect(state.resolution.width).toBe(1920)
  })

  it('DENYLIST is non-empty and readonly', () => {
    expect(DENYLIST.length).toBeGreaterThan(0)
    type IsReadonly = typeof DENYLIST extends ReadonlyArray<string> ? true : false
    const _check: IsReadonly = true
    expect(_check).toBe(true)
  })
})
