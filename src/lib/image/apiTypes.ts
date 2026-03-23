/**
 * JSON body for `POST /api/images` (dev/preview proxy → OpenAI).
 */
import type { GeneratedImage } from '@/lib/image/types'

export type ImageProxyMode = 'generations' | 'edits'

/** Payload from {@link QueryInput} when the user submits an image generation. */
export interface ImageGenerationPayload {
  prompt: string
  /** When true, server appends photoreal suffix and uses `hd` quality for generations. */
  photoreal: boolean
  /** Use `images/edits` with the first PNG reference. */
  editMode: boolean
  /** Raw base64 (no `data:` prefix), PNG for edits. */
  references: Array<{ base64: string; mimeType: string }>
  /** Required when `references.length > 0`. */
  referenceRightsConfirmed: boolean
}

export interface ImageProxyRequest {
  mode: ImageProxyMode
  prompt: string
  /** e.g. `1024x1024` — generations only; edits use square sizes server-side. */
  size?: string
  /** DALL-E 3 quality when mode is generations. */
  quality?: 'standard' | 'hd'
  /** Clamped to 1 for dall-e-3. */
  n?: number
  /** Append photoreal suffix to prompt (server-side). */
  photoreal?: boolean
  /** For mode `edits`: PNG base64 (raw, no data: prefix). */
  references?: Array<{ base64: string; mimeType: string }>
  /** Required when references are present (Phase 8). */
  referenceRightsConfirmed?: boolean
}

export interface ImageProxyResponse {
  images: GeneratedImage[]
}
