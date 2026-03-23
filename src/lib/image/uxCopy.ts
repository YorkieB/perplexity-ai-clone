/**
 * User-facing copy for image generation toasts (no PII, no raw API bodies).
 */
import { ImageGenerationError } from '@/lib/image/errors'

export const imageCopy = {
  rightsRequiredTitle: 'Confirm reference rights',
  rightsRequiredDescription:
    'You must confirm you have rights to use the reference images before generating.',

  rateLimitedTitle: 'Image generation limited',
  rateLimitedDescription: 'Too many requests. Wait a moment and try again.',

  moderationTitle: 'Request blocked',
  moderationDescription: 'This prompt or image did not pass content guidelines.',

  failedTitle: 'Could not generate image',
  failedDescription: 'Check your connection and API configuration, then try again.',

  cooldownTitle: 'Please wait',
  cooldownDescription: 'Image generation was started recently. Try again in a few seconds.',

  retry: 'Retry',
  dismiss: 'Dismiss',
} as const

export function isImageGenerationError(err: unknown): err is ImageGenerationError {
  return err instanceof ImageGenerationError
}

export function toastBodyForImageError(err: unknown): { title: string; description?: string } {
  if (isImageGenerationError(err)) {
    switch (err.code) {
      case 'RATE_LIMITED':
        return { title: imageCopy.rateLimitedTitle, description: imageCopy.rateLimitedDescription }
      case 'MODERATION_BLOCKED':
        return { title: imageCopy.moderationTitle, description: imageCopy.moderationDescription }
      case 'REFERENCE_REQUIRED':
        return { title: imageCopy.failedTitle, description: 'Add a PNG reference image for edit mode.' }
      case 'RIGHTS_NOT_CONFIRMED':
        return {
          title: imageCopy.rightsRequiredTitle,
          description: imageCopy.rightsRequiredDescription,
        }
      case 'NOT_CONFIGURED':
        return { title: imageCopy.failedTitle, description: 'Missing API key on the server.' }
      case 'UPSTREAM':
        return { title: imageCopy.failedTitle, description: err.message }
      default:
        return { title: imageCopy.failedTitle, description: err.message }
    }
  }
  if (err instanceof Error) {
    return { title: imageCopy.failedTitle, description: err.message }
  }
  return { title: imageCopy.failedTitle, description: imageCopy.failedDescription }
}
