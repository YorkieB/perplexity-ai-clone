import { describe, expect, it } from '@jest/globals'

import { parseProactiveSuggestion } from '../proactive-vision'

describe('parseProactiveSuggestion', () => {
  it('returns null for NONE', () => {
    expect(parseProactiveSuggestion('NONE')).toBeNull()
    expect(parseProactiveSuggestion('none')).toBeNull()
  })

  it('extracts SUGGEST: line', () => {
    expect(parseProactiveSuggestion('SUGGEST: Close the error dialog first.')).toBe('Close the error dialog first.')
  })
})
