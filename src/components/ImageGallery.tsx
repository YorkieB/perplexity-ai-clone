import { useState, useCallback, useEffect } from 'react'
import { SearchImage } from '@/lib/types'
import { X } from '@phosphor-icons/react'

interface ImageGalleryProps {
  images: SearchImage[]
  maxImages?: number
}

export function ImageGallery({ images, maxImages = 8 }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const visible = images.slice(0, maxImages)

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowRight' && lightboxIndex < visible.length - 1) setLightboxIndex(lightboxIndex + 1)
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, visible.length, closeLightbox])

  if (visible.length === 0) return null

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Images
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {visible.map((img, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className="shrink-0 rounded-lg overflow-hidden border border-border hover:border-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <img
                src={img.url}
                alt={img.description || ''}
                loading="lazy"
                className="h-28 w-auto max-w-[200px] object-cover"
                onError={(e) => { e.currentTarget.parentElement!.style.display = 'none' }}
              />
              {img.description && (
                <p className="text-[10px] text-muted-foreground px-2 py-1 truncate max-w-[200px]">
                  {img.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && visible[lightboxIndex] && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
          onKeyDown={(e) => { if (e.key === 'Escape') closeLightbox() }}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={28} weight="bold" />
          </button>
          <div role="presentation" className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={visible[lightboxIndex].url}
              alt={visible[lightboxIndex].description || ''}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            {visible[lightboxIndex].description && (
              <p className="text-sm text-white/80 text-center max-w-xl">
                {visible[lightboxIndex].description}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
