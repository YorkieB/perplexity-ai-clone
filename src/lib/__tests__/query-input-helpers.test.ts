import { describe, expect, it } from '@jest/globals'

import {
  chooseAutoChatModel,
  describeAutoModelDecision,
  estimateLocalUsage,
} from '../query-input-helpers'

describe('chooseAutoChatModel', () => {
  it('routes attachments to the larger model', () => {
    const decision = chooseAutoChatModel({ query: 'quick question', attachmentCount: 1 })
    expect(decision.model).toBe('gpt-4o')
    expect(decision.reason).toBe('attachments')
  })

  it('routes short prompts to mini', () => {
    const decision = chooseAutoChatModel({ query: 'hello', attachmentCount: 0 })
    expect(decision.model).toBe('gpt-4o-mini')
    expect(decision.reason).toBe('short-query')
  })

  it('describes decisions for UI labels', () => {
    expect(describeAutoModelDecision({ model: 'gpt-4o', reason: 'long-query' })).toBe('long prompt')
  })
})

describe('estimateLocalUsage', () => {
  it('returns rough local estimates from message content', () => {
    const usage = estimateLocalUsage([
      { content: 'abcd' },
      { content: 'abcdefgh' },
    ])
    expect(usage.messageCount).toBe(2)
    expect(usage.characterCount).toBe(12)
    expect(usage.estimatedTokens).toBe(3)
  })
})
