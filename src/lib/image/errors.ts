/**
 * Client-side errors from `POST /api/images` (and future providers). No secrets in messages.
 */
export type ImageGenerationErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMIT'
  | 'MODERATION'
  | 'UPSTREAM'
  | 'NETWORK'
  | 'UNKNOWN'

export class ImageGenerationError extends Error {
  readonly code: ImageGenerationErrorCode
  readonly httpStatus: number
  /** Raw upstream JSON string when available (for debugging; avoid logging in production). */
  readonly upstreamBody?: string

  constructor(
    code: ImageGenerationErrorCode,
    message: string,
    httpStatus: number,
    options?: { upstreamBody?: string }
  ) {
    super(message)
    this.name = 'ImageGenerationError'
    this.code = code
    this.httpStatus = httpStatus
    this.upstreamBody = options?.upstreamBody
  }

  /** Map a failed `fetch` response body (OpenAI-style JSON or plain text). */
  static fromHttpResponse(status: number, bodyText: string): ImageGenerationError {
    let message = bodyText.slice(0, 500)
    let code: ImageGenerationErrorCode = 'UNKNOWN'

    if (status === 429) {
      code = 'RATE_LIMIT'
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
        code = 'MODERATION'
      }
    } catch {
      /* use defaults */
    }

    if (status === 400 && code === 'UNKNOWN') {
      code = 'BAD_REQUEST'
    }

    return new ImageGenerationError(code, message, status, { upstreamBody: bodyText })
  }
}
