import { generateId } from '@/lib/helpers'
import type { GeneratedImage } from '@/lib/image/types'
import type { ImageProxyRequest, ImageProxyResponse } from '@/lib/image/apiTypes'
import { ImageGenerationError } from '@/lib/image/errors'
import { IMAGE_GENERATION_COOLDOWN_MS } from '@/lib/image/limits'

/** Set on failed requests; cleared on success. Retry helper clears this. */
let lastImageGenFailureAt = 0

function mapOpenAiSizeToDimensions(size: string): { w: number; h: number } {
  const parts = size.split('x').map((s) => parseInt(s, 10))
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return { w: parts[0], h: parts[1] }
  }
  return { w: 1024, h: 1024 }
}

/**
 * Calls same-origin `POST /api/images` and returns normalized {@link GeneratedImage} rows.
 * Persists inline base64 when the API returns `b64_json` (Phase 4 — survives refresh vs short URLs).
 */
export async function generateImagesViaApi(req: ImageProxyRequest): Promise<GeneratedImage[]> {
  const now = Date.now()
  if (
    lastImageGenFailureAt > 0 &&
    now - lastImageGenFailureAt < IMAGE_GENERATION_COOLDOWN_MS
  ) {
    throw new ImageGenerationError(
      'BAD_REQUEST',
      'Please wait before trying image generation again.',
      { status: 429 }
    )
  }

  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  const text = await res.text()
  if (!res.ok) {
    lastImageGenFailureAt = Date.now()
    let message = text.slice(0, 500)
    try {
      const j = JSON.parse(text) as { error?: { message?: string }; message?: string }
      message = j.error?.message || j.message || message
    } catch {
      /* raw */
    }
    if (res.status === 429) {
      throw new ImageGenerationError('RATE_LIMITED', message || 'Rate limited', { status: 429 })
    }
    if (res.status === 400 && /rights not confirmed/i.test(message)) {
      throw new ImageGenerationError('RIGHTS_NOT_CONFIRMED', message, { status: 400 })
    }
    if (res.status === 400 && /reference image required/i.test(message)) {
      throw new ImageGenerationError('REFERENCE_REQUIRED', message, { status: 400 })
    }
    if (res.status === 400 && /moderation|content policy|safety/i.test(message)) {
      throw new ImageGenerationError('MODERATION_BLOCKED', message, { status: 400 })
    }
    throw new ImageGenerationError('UNKNOWN', message || `Request failed (${res.status})`, {
      status: res.status,
    })
  }

  lastImageGenFailureAt = 0

  let data: ImageProxyResponse
  try {
    data = JSON.parse(text) as ImageProxyResponse
  } catch {
    throw new ImageGenerationError('UNKNOWN', 'Invalid JSON from image proxy')
  }

  const images = data.images || []
  return images.map((img) => {
    const { w, h } = mapOpenAiSizeToDimensions(`${img.width}x${img.height}`)
    return {
      ...img,
      id: img.id || generateId(),
      width: img.width || w,
      height: img.height || h,
      dataUrl:
        img.base64 && img.mimeType
          ? `data:${img.mimeType};base64,${img.base64}`
          : img.dataUrl,
    }
  })
}

/** Call before Retry so the cooldown does not block a new attempt. */
export function clearImageGenerationCooldown(): void {
  lastImageGenFailureAt = 0
}
