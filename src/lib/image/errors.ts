/**
 * Client-side errors from `POST /api/images` (and future providers). No secrets in messages.
 */
export type ImageGenerationErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'MODERATION_BLOCKED'
  | 'NETWORK'
  | 'NOT_CONFIGURED'
  | 'REFERENCE_REQUIRED'
  | 'RIGHTS_NOT_CONFIRMED'
  | 'UPSTREAM'
  | 'UNKNOWN'

export class ImageGenerationError extends Error {
  readonly code: ImageGenerationErrorCode
  readonly status?: number
  /** Raw upstream JSON string when available (for debugging; avoid logging in production). */
  readonly upstreamBody?: string

  constructor(
    code: ImageGenerationErrorCode,
    message: string,
    options?: { status?: number; upstreamBody?: string; cause?: unknown }
  ) {
    super(message)
    this.name = 'ImageGenerationError'
    this.code = code
    this.status = options?.status
    this.upstreamBody = options?.upstreamBody
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }

  /** Map a failed `fetch` response body (OpenAI-style JSON or plain text). */
  static fromHttpResponse(status: number, bodyText: string): ImageGenerationError {
    let message = bodyText.slice(0, 500)
    let code: ImageGenerationErrorCode = 'UNKNOWN'

    if (status === 429) {
      code = 'RATE_LIMITED'
      message = 'Rate limited. Try again later.'
    } else if (status === 400) {
      code = 'BAD_REQUEST'
    } else if (status >= 500) {
      code = 'UPSTREAM'
    }

    try {
      const parsed = JSON.parse(bodyText) as {
        error?: { message?: string; code?: string }
        message?: string
      }
      const inner = parsed.error?.message ?? parsed.message
      if (typeof inner === 'string' && inner.length > 0) {
        message = inner
      }
      const oc = parsed.error?.code
      if (oc === 'content_policy_violation' || message.toLowerCase().includes('content policy')) {
        code = 'MODERATION_BLOCKED'
      }
      if (/rights not confirmed/i.test(message)) {
        code = 'RIGHTS_NOT_CONFIRMED'
      }
      if (/reference image required/i.test(message)) {
        code = 'REFERENCE_REQUIRED'
      }
    } catch {
      /* use defaults */
    }

    if (status === 400 && code === 'UNKNOWN') {
      code = 'BAD_REQUEST'
    }

    return new ImageGenerationError(code, message, { status, upstreamBody: bodyText })
  }
}
