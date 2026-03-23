import type { GeneratedImage } from '@/lib/image/types'

/**
 * Stable `src` for `<img>` from a {@link GeneratedImage}. Prefers inline data when present.
 *
 * When only {@link GeneratedImage.url} is set, the URL may be short-lived; the dev proxy uses
 * `b64_json` so persisted threads typically include {@link GeneratedImage.base64}.
 */
export function displaySrcForGeneratedImage(img: GeneratedImage): string | undefined {
  if (img.dataUrl) return img.dataUrl
  if (img.base64) return `data:${img.mimeType};base64,${img.base64}`
  if (img.url) return img.url
  return undefined
}

/** Accessible alt text from the prompt used for generation (truncated). */
export function altTextForGeneratedImage(promptSnapshot: string, maxLen = 120): string {
  const t = promptSnapshot.trim()
  const prefix = 'Generated image'
  if (!t.length) return prefix
  if (t.length <= maxLen) return `${prefix}: ${t}`
  return `${prefix}: ${t.slice(0, Math.max(0, maxLen - 1))}…`
}
