export type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationStatus,
  MessageImageGenerationState,
} from '@/lib/image/types'

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
