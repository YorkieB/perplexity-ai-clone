import { describe, it, expect } from 'vitest'
import { splitThinkingFromModelContent } from '../src/lib/thinking-tags'

const OPEN = '<' + 'think' + '>'
const CLOSE = '<' + '/' + 'think' + '>'

describe('splitThinkingFromModelContent', () => {
  it('returns full string as answer when no think tags', () => {
    const r = splitThinkingFromModelContent('Hello world', '')
    expect(r.answer).toBe('Hello world')
    expect(r.thinking).toBe('')
    expect(r.insideThinkingBlock).toBe(false)
  })

  it('merges API reasoning with no tags', () => {
    const r = splitThinkingFromModelContent('Answer only', 'step 1; step 2')
    expect(r.answer).toBe('Answer only')
    expect(r.thinking).toBe('step 1; step 2')
  })

  it('extracts think block and answer', () => {
    const raw = `${OPEN}trace${CLOSE}final`
    const r = splitThinkingFromModelContent(raw, '')
    expect(r.thinking).toBe('trace')
    expect(r.answer).toBe('final')
    expect(r.insideThinkingBlock).toBe(false)
  })

  it('streams partial think block before close tag', () => {
    const r = splitThinkingFromModelContent(`${OPEN}partial`, '')
    expect(r.answer).toBe('')
    expect(r.thinking).toBe('partial')
    expect(r.insideThinkingBlock).toBe(true)
  })
})
