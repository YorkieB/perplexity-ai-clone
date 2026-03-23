import { describe, expect, it } from 'vitest'
import { ImageGenerationError } from '@/lib/image/errors'

describe('ImageGenerationError.fromHttpResponse', () => {
  it('maps 429 to RATE_LIMIT', () => {
    const e = ImageGenerationError.fromHttpResponse(429, '{"error":{"message":"Too Many Requests"}}')
    expect(e.code).toBe('RATE_LIMIT')
    expect(e.httpStatus).toBe(429)
  })

  it('maps content_policy to MODERATION', () => {
    const e = ImageGenerationError.fromHttpResponse(
      400,
      JSON.stringify({ error: { message: 'Rejected', code: 'content_policy_violation' } })
    )
    expect(e.code).toBe('MODERATION')
  })

  it('maps 5xx to UPSTREAM', () => {
    const e = ImageGenerationError.fromHttpResponse(503, 'upstream down')
    expect(e.code).toBe('UPSTREAM')
  })
})
