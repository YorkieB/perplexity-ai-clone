import { ImageGenerationError } from '@/lib/image/errors'
import type { GeneratedImage } from '@/lib/image/types'
import type { ImageGenerationOptions } from '@/lib/image/types'

/** Successful `POST /api/images` JSON shape (stable for clients). */
export interface GenerateImagesResponse {
  images: GeneratedImage[]
}

export type GenerateImagesFromTextOptions = ImageGenerationOptions & {
  signal?: AbortSignal
}

/**
 * Text-only image generation via same-origin `POST /api/images` (Vite dev/preview proxy → OpenAI Images API).
 * The API key never leaves the server.
 */
export async function generateImagesFromText(
  prompt: string,
  options: GenerateImagesFromTextOptions
): Promise<GeneratedImage[]> {
  const { signal, ...rest } = options
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      width: rest.width,
      height: rest.height,
      n: rest.n ?? 1,
      model: rest.model,
    }),
    signal,
  })

  const text = await res.text()
  if (!res.ok) {
    throw ImageGenerationError.fromHttpResponse(res.status, text)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new ImageGenerationError('UPSTREAM', 'Invalid JSON from image service', { status: res.status })
  }

  if (!parsed || typeof parsed !== 'object' || !('images' in parsed)) {
    throw new ImageGenerationError('UPSTREAM', 'Missing images array in response', { status: res.status })
  }

  const images = (parsed as GenerateImagesResponse).images
  if (!Array.isArray(images)) {
    throw new ImageGenerationError('UPSTREAM', 'Invalid images array in response', { status: res.status })
  }

  return images
}
