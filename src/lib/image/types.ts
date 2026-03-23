/**
 * Vendor-neutral image generation domain types (no HTTP or API keys here).
 */

/**
 * A single generated image attached to a message or artifact store.
 *
 * **Payload strategy (choose what fits your persistence layer):**
 *
 * - **`url`** — Points to a remote asset (CDN, signed URL, etc.). Smallest in `localStorage`,
 *   but URLs may **expire** or require auth; re-fetch can fail later.
 * - **`dataUrl`** — Full `data:<mime>;base64,...` string. Self-contained and easy to render in
 *   `<img src>`, but **large** (≈33% overhead vs raw bytes) and can **bloat persisted threads**.
 * - **`base64`** — Raw base64 without the `data:` prefix; combine with {@link mimeType} when
 *   building a data URL or decoding. Slightly smaller than `dataUrl` string length for the same
 *   pixels, still heavy for storage.
 *
 * Callers should persist **at most one** inline strategy (`dataUrl` xor `base64`) plus optional
 * `url` for the same id if both short-lived remote and local fallback are needed.
 */
export interface GeneratedImage {
  id: string
  /** Prompt text as executed (for audit / replay; may differ from UI draft after templating). */
  promptSnapshot: string
  width: number
  height: number
  /** IANA media type, e.g. `image/png`, `image/jpeg`. */
  mimeType: string
  /** Remote image URL when the provider hosts the asset. */
  url?: string
  /** Inline `data:<mime>;base64,...` suitable for `img` `src`. */
  dataUrl?: string
  /** Raw base64 payload without `data:` prefix; use with {@link mimeType}. */
  base64?: string
}

/**
 * Options for a generation request. Intentionally minimal and provider-agnostic.
 */
export interface ImageGenerationOptions {
  /** Target width in pixels. */
  width: number
  /** Target height in pixels. */
  height: number
  /**
   * How many images to generate. Providers may clamp; keep small (e.g. 1–4).
   * @default 1
   */
  n?: number
  /** Optional model identifier when a future provider supports multiple models. */
  model?: string
}

/** High-level state for async image generation on a chat message. */
export type ImageGenerationStatus = 'pending' | 'complete' | 'failed'

/** Optional metadata when a message involves image generation lifecycle. */
export interface MessageImageGenerationState {
  status: ImageGenerationStatus
  /** Present when `status` is `'failed'`. */
  errorMessage?: string
}
