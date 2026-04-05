import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/llm', () => ({
  callLlm: vi.fn(async () => {
    throw new Error('audit model unavailable')
  }),
}))

describe('hallucination guard reliability semantics', () => {
  it('fails closed with explicit validation_error flag when audit model call fails', async () => {
    const { validateResponse } = await import('../../src/lib/hallucination-guard')

    const result = await validateResponse({
      userQuery: 'What happened?',
      response: 'According to a study, usage increased by 230%.',
      strictMode: true,
    })

    expect(result.report.passed).toBe(false)
    expect(result.report.confidence).toBe(0)
    expect(result.report.flags.some((f) => f.type === 'validation_error')).toBe(true)
    expect(result.report.flags.some((f) => f.severity === 'high')).toBe(true)
  })
})
