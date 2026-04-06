import { chooseAutoModel } from '@/lib/chat-model-heuristics'

describe('chooseAutoModel', () => {
  it('uses larger model when attachments are present', () => {
    const decision = chooseAutoModel('Summarize this image', true)
    expect(decision.model).toBe('gpt-4o')
    expect(decision.reason).toBe('Attachments present')
  })

  it('uses larger model for long structured prompts', () => {
    const longPrompt = 'Please review this architecture.\n'.repeat(20)
    const decision = chooseAutoModel(longPrompt, false)
    expect(decision.model).toBe('gpt-4o')
  })

  it('uses mini model for short direct prompts', () => {
    const decision = chooseAutoModel('What is 2 + 2?', false)
    expect(decision.model).toBe('gpt-4o-mini')
  })
})
