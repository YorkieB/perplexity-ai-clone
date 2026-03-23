import { describe, expect, it } from 'vitest'
import { ImageGenerationError } from '@/lib/image/errors'
import { imageCopy, isImageGenerationError, toastBodyForImageError } from '@/lib/image/uxCopy'

describe('isImageGenerationError', () => {
  it('returns true for ImageGenerationError', () => {
    expect(isImageGenerationError(new ImageGenerationError('UNKNOWN', 'x'))).toBe(true)
  })

  it('returns false for generic Error', () => {
    expect(isImageGenerationError(new Error('x'))).toBe(false)
  })
})

describe('toastBodyForImageError', () => {
  it('maps RATE_LIMITED', () => {
    const r = toastBodyForImageError(new ImageGenerationError('RATE_LIMITED', 'slow'))
    expect(r.title).toBe(imageCopy.rateLimitedTitle)
    expect(r.description).toBe(imageCopy.rateLimitedDescription)
  })

  it('maps MODERATION_BLOCKED', () => {
    const r = toastBodyForImageError(new ImageGenerationError('MODERATION_BLOCKED', 'bad'))
    expect(r.title).toBe(imageCopy.moderationTitle)
  })

  it('maps REFERENCE_REQUIRED', () => {
    const r = toastBodyForImageError(new ImageGenerationError('REFERENCE_REQUIRED', 'need ref'))
    expect(r.title).toBe(imageCopy.failedTitle)
    expect(r.description).toMatch(/PNG reference/i)
  })

  it('maps RIGHTS_NOT_CONFIRMED', () => {
    const r = toastBodyForImageError(new ImageGenerationError('RIGHTS_NOT_CONFIRMED', 'rights'))
    expect(r.title).toBe(imageCopy.rightsRequiredTitle)
  })
})
