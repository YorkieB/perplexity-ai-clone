export type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationStatus,
  MessageImageGenerationState,
} from '@/lib/image/types'

export type { ImageGenerationPayload, ImageProxyMode, ImageProxyRequest, ImageProxyResponse } from '@/lib/image/apiTypes'

export type { ImageGenerationErrorCode } from '@/lib/image/errors'
export { ImageGenerationError } from '@/lib/image/errors'

export type { GenerateImagesFromTextOptions, GenerateImagesResponse } from '@/lib/image/client'
export { generateImagesFromText } from '@/lib/image/client'

export { altTextForGeneratedImage, displaySrcForGeneratedImage } from '@/lib/image/display'

export type { ImageGenerationProvider } from '@/lib/image/provider'
export {
  ImageGenerationNotImplementedError,
  ImageProviderStub,
  NullImageProvider,
} from '@/lib/image/provider'

export {
  IMAGE_GENERATION_COOLDOWN_MS,
  IMAGE_MAX_PROMPT_LENGTH,
  IMAGE_MAX_REFERENCE_BYTES,
  IMAGE_MAX_REFERENCES,
} from '@/lib/image/limits'

export { PHOTOREAL_PROMPT_SUFFIX } from '@/lib/image/promptTemplates'

export { clearImageGenerationCooldown, generateImagesViaApi } from '@/lib/image/generateImages'

export { imageCopy, isImageGenerationError, toastBodyForImageError } from '@/lib/image/uxCopy'
