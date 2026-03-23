import type { GeneratedImage } from '@/lib/image/types'
import type { ImageGenerationOptions } from '@/lib/image/types'

/** Thrown when no real image backend is configured (stub / Phase 0). */
export class ImageGenerationNotImplementedError extends Error {
  readonly code = 'IMAGE_GENERATION_NOT_IMPLEMENTED' as const

  constructor(message = 'Image generation is not configured.') {
    super(message)
    this.name = 'ImageGenerationNotImplementedError'
  }
}

/**
 * Pluggable image generation (vendor-neutral). Real providers implement HTTP/SDK elsewhere.
 */
export interface ImageGenerationProvider {
  /**
   * Reserved for UI placeholders or skeleton previews without calling an API.
   * Default stub returns an empty array.
   */
  generatePlaceholder?(): Promise<GeneratedImage[]>

  /**
   * Generate one or more images from a prompt. Implementations may ignore unknown {@link ImageGenerationOptions} fields.
   */
  generateImages?(prompt: string, options: ImageGenerationOptions): Promise<GeneratedImage[]>
}

/**
 * No-op provider: safe to import in builds where image APIs are not wired yet.
 */
export class NullImageProvider implements ImageGenerationProvider {
  async generatePlaceholder(): Promise<GeneratedImage[]> {
    return []
  }

  async generateImages(prompt: string, options: ImageGenerationOptions): Promise<GeneratedImage[]> {
    void prompt
    void options
    throw new ImageGenerationNotImplementedError()
  }
}

/** Alias for consumers who prefer “stub” naming. */
export const ImageProviderStub = NullImageProvider
