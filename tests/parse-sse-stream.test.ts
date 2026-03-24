import { describe, it, expect } from 'vitest'
import { parseSseLines } from '../src/lib/parse-sse-stream'

describe('parseSseLines', () => {
  it('yields content deltas from complete SSE lines', () => {
    const chunk =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
    const { contentDeltas, reasoningDeltas, rest } = parseSseLines(chunk)
    expect(contentDeltas).toEqual(['Hello', ' world'])
    expect(reasoningDeltas).toEqual([])
    expect(rest).toBe('')
  })

  it('keeps incomplete line in rest buffer', () => {
    const { contentDeltas, rest } = parseSseLines('data: {"choices":[{"delta":{"content":"Hi"')
    expect(contentDeltas).toEqual([])
    expect(rest).toBe('data: {"choices":[{"delta":{"content":"Hi"')
  })

  it('skips [DONE] and malformed JSON lines', () => {
    const chunk =
      'data: [DONE]\n\n' +
      'data: not-json\n\n' +
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n'
    const { contentDeltas } = parseSseLines(chunk)
    expect(contentDeltas).toEqual(['x'])
  })

  it('extracts reasoning_content deltas', () => {
    const chunk =
      'data: {"choices":[{"delta":{"reasoning_content":"Let"}}]}\n\n' +
      'data: {"choices":[{"delta":{"reasoning_content":" me think"}}]}\n\n'
    const { reasoningDeltas, contentDeltas } = parseSseLines(chunk)
    expect(reasoningDeltas).toEqual(['Let', ' me think'])
    expect(contentDeltas).toEqual([])
  })
})
