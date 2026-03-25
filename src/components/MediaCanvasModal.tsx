import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { useMediaCanvasRegister, useMediaCanvasItems, useMediaCanvasGenerating } from '@/contexts/MediaCanvasContext'
import type { MediaCanvasControl, MediaItem } from '@/contexts/MediaCanvasContext'
import { editImage } from '@/lib/media-api'
import {
  Download,
  Eraser,
  Loader2,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
  Paintbrush,
  X as LucideX,
  Sun,
  Contrast,
  Droplets,
} from 'lucide-react'

interface MediaCanvasModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

interface Filters {
  contrast: number
  brightness: number
  saturation: number
}

const DEFAULT_FILTERS: Filters = { contrast: 100, brightness: 100, saturation: 100 }

export function MediaCanvasModal({ open, onOpenChange }: MediaCanvasModalProps) {
  const { register, unregister } = useMediaCanvasRegister()
  const { items, addItem, activeItemId, setActiveItemId } = useMediaCanvasItems()
  const { generating, generatingLabel } = useMediaCanvasGenerating()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS })
  const [maskMode, setMaskMode] = useState(false)
  const [brushSize, setBrushSize] = useState(30)
  const [isDrawing, setIsDrawing] = useState(false)
  const [aiEditing, setAiEditing] = useState(false)
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])

  const activeItem = items.find(i => i.id === activeItemId) ?? null
  const isImage = activeItem?.type === 'image'
  const isVideo = activeItem?.type === 'video'

  const drawImageToCanvas = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.filter = `contrast(${filters.contrast}%) brightness(${filters.brightness}%) saturate(${filters.saturation}%)`
      ctx.drawImage(img, 0, 0)
    }
    img.src = dataUrl
  }, [filters])

  useEffect(() => {
    if (activeItem?.type === 'image') {
      drawImageToCanvas(activeItem.dataUrl)
      const mc = maskCanvasRef.current
      if (mc) {
        const ctx = mc.getContext('2d')
        if (ctx) {
          mc.width = canvasRef.current?.width || 1024
          mc.height = canvasRef.current?.height || 1024
          ctx.clearRect(0, 0, mc.width, mc.height)
        }
      }
    }
  }, [activeItem, drawImageToCanvas])

  useEffect(() => {
    if (activeItem?.type === 'image' && canvasRef.current) {
      drawImageToCanvas(activeItem.dataUrl)
    }
  }, [filters, activeItem, drawImageToCanvas])

  const pushUndo = useCallback(() => {
    if (!activeItem || activeItem.type !== 'image') return
    setUndoStack(prev => [...prev.slice(-19), activeItem.dataUrl])
    setRedoStack([])
  }, [activeItem])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !activeItem) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(r => [...r, activeItem.dataUrl])
    setUndoStack(u => u.slice(0, -1))
    const updated: MediaItem = { ...activeItem, dataUrl: prev }
    addItem(updated)
  }, [undoStack, activeItem, addItem])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !activeItem) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(u => [...u, activeItem.dataUrl])
    setRedoStack(r => r.slice(0, -1))
    const updated: MediaItem = { ...activeItem, dataUrl: next }
    addItem(updated)
  }, [redoStack, activeItem, addItem])

  const getCanvasDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvas.height
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null
    ctx.filter = `contrast(${filters.contrast}%) brightness(${filters.brightness}%) saturate(${filters.saturation}%)`
    const img = new Image()
    img.src = activeItem?.dataUrl || ''
    ctx.drawImage(img, 0, 0)
    return tempCanvas.toDataURL('image/png')
  }, [filters, activeItem])

  const handleDownload = useCallback(() => {
    if (isVideo && activeItem) {
      const a = document.createElement('a')
      a.href = activeItem.dataUrl
      a.download = `jarvis-video-${Date.now()}.mp4`
      a.click()
      return
    }
    const url = getCanvasDataUrl()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `jarvis-image-${Date.now()}.png`
    a.click()
  }, [isVideo, activeItem, getCanvasDataUrl])

  const handleHdEnhance = useCallback(async () => {
    if (!activeItem || activeItem.type !== 'image') return
    pushUndo()
    setAiEditing(true)
    try {
      const result = await editImage(
        activeItem.dataUrl,
        'Enhance this image: increase sharpness, clarity, fine details, and overall quality. Make it look higher resolution and more refined.',
        { quality: 'high', size: '1024x1024' },
      )
      const enhanced: MediaItem = { ...activeItem, id: `img-${Date.now()}`, dataUrl: result, timestamp: Date.now() }
      addItem(enhanced)
      toast.success('Image enhanced')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'HD enhance failed')
    } finally {
      setAiEditing(false)
    }
  }, [activeItem, pushUndo, addItem])

  const getMaskBlobAsync = useCallback(async (): Promise<Blob | null> => {
    const mc = maskCanvasRef.current
    if (!mc) return null
    const ctx = mc.getContext('2d')
    if (!ctx) return null
    const imgData = ctx.getImageData(0, 0, mc.width, mc.height)
    let hasContent = false
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) { hasContent = true; break }
    }
    if (!hasContent) return null

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = mc.width
    maskCanvas.height = mc.height
    const mctx = maskCanvas.getContext('2d')!
    mctx.fillStyle = 'black'
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    const maskImgData = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 50) {
        maskImgData.data[i] = 255
        maskImgData.data[i + 1] = 255
        maskImgData.data[i + 2] = 255
        maskImgData.data[i + 3] = 255
      }
    }
    mctx.putImageData(maskImgData, 0, 0)

    return new Promise<Blob | null>((resolve) => {
      maskCanvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }, [])

  const handleObjectRemoval = useCallback(async () => {
    if (!activeItem || activeItem.type !== 'image') return
    const maskBlob = await getMaskBlobAsync()
    if (!maskBlob) {
      toast.error('Draw over the object you want to remove first.')
      return
    }
    pushUndo()
    setAiEditing(true)
    try {
      const result = await editImage(
        activeItem.dataUrl,
        'Remove the masked object and fill the area naturally with the surrounding background.',
        { mask: maskBlob, quality: 'high' },
      )
      const edited: MediaItem = { ...activeItem, id: `img-${Date.now()}`, dataUrl: result, timestamp: Date.now() }
      addItem(edited)
      setMaskMode(false)
      toast.success('Object removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Object removal failed')
    } finally {
      setAiEditing(false)
    }
  }, [activeItem, getMaskBlobAsync, pushUndo, addItem])

  const handleMaskDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!maskMode || !isDrawing) return
    const mc = maskCanvasRef.current
    if (!mc) return
    const ctx = mc.getContext('2d')
    if (!ctx) return
    const rect = mc.getBoundingClientRect()
    const scaleX = mc.width / rect.width
    const scaleY = mc.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    ctx.arc(x, y, brushSize * scaleX, 0, Math.PI * 2)
    ctx.fill()
  }, [maskMode, isDrawing, brushSize])

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS })
  }, [])

  useEffect(() => {
    if (!open) return

    const control: MediaCanvasControl = {
      showImage: (base64DataUrl: string, prompt?: string) => {
        const item: MediaItem = {
          id: `img-${Date.now()}`,
          type: 'image',
          dataUrl: base64DataUrl,
          prompt,
          timestamp: Date.now(),
        }
        addItem(item)
        setFilters({ ...DEFAULT_FILTERS })
        setMaskMode(false)
        setUndoStack([])
        setRedoStack([])
      },
      showVideo: (blobUrl: string, prompt?: string) => {
        const item: MediaItem = {
          id: `vid-${Date.now()}`,
          type: 'video',
          dataUrl: blobUrl,
          prompt,
          timestamp: Date.now(),
        }
        addItem(item)
      },
      applyEdit: (editedBase64: string) => {
        if (!activeItem || activeItem.type !== 'image') return
        pushUndo()
        const updated: MediaItem = { ...activeItem, id: `img-${Date.now()}`, dataUrl: editedBase64, timestamp: Date.now() }
        addItem(updated)
      },
      getCurrentImageBase64: () => {
        if (!activeItem || activeItem.type !== 'image') return null
        return activeItem.dataUrl
      },
      isOpen: () => open,
      openCanvas: () => onOpenChange(true),
    }

    register(control)
    return () => unregister()
  }, [open, register, unregister, addItem, activeItem, pushUndo, onOpenChange])

  const uniqueItems = [...new Map(items.map(i => [i.id, i])).values()]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Media Canvas
              {activeItem?.prompt && (
                <span className="ml-2 text-xs font-normal text-muted-foreground truncate max-w-[400px] inline-block align-middle">
                  — {activeItem.prompt}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {generating && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {generatingLabel || 'Generating...'}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main display */}
          <div className="flex-1 flex items-center justify-center bg-muted/30 relative overflow-auto p-4">
            {!activeItem && !generating && (
              <div className="text-muted-foreground text-sm text-center">
                Ask Jarvis to generate an image or video.<br />
                <span className="text-xs">e.g. "Create an image of a sunset over mountains"</span>
              </div>
            )}
            {!activeItem && generating && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">{generatingLabel || 'Generating...'}</span>
              </div>
            )}
            {isImage && (
              <div className="relative inline-block">
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-[60vh] object-contain rounded-md shadow-lg"
                  style={{ imageRendering: 'auto' }}
                />
                {maskMode && (
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    style={{ mixBlendMode: 'multiply' }}
                    onMouseDown={() => setIsDrawing(true)}
                    onMouseUp={() => setIsDrawing(false)}
                    onMouseLeave={() => setIsDrawing(false)}
                    onMouseMove={handleMaskDraw}
                  />
                )}
              </div>
            )}
            {isVideo && (
              <video
                ref={videoRef}
                src={activeItem?.dataUrl}
                controls
                autoPlay
                loop
                className="max-w-full max-h-[60vh] rounded-md shadow-lg"
              />
            )}
            {aiEditing && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm font-medium">Applying AI edit...</span>
                </div>
              </div>
            )}
          </div>

          {/* Editing sidebar (images only) */}
          {isImage && (
            <div className="w-56 shrink-0 border-l border-border bg-background p-3 flex flex-col gap-4 overflow-y-auto">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adjustments</div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Contrast className="h-3 w-3" /> Contrast
                    <span className="ml-auto tabular-nums">{filters.contrast}%</span>
                  </label>
                  <Slider
                    min={0} max={200} value={[filters.contrast]}
                    onValueChange={([v]) => setFilters(f => ({ ...f, contrast: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sun className="h-3 w-3" /> Brightness
                    <span className="ml-auto tabular-nums">{filters.brightness}%</span>
                  </label>
                  <Slider
                    min={0} max={200} value={[filters.brightness]}
                    onValueChange={([v]) => setFilters(f => ({ ...f, brightness: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Droplets className="h-3 w-3" /> Saturation
                    <span className="ml-auto tabular-nums">{filters.saturation}%</span>
                  </label>
                  <Slider
                    min={0} max={200} value={[filters.saturation]}
                    onValueChange={([v]) => setFilters(f => ({ ...f, saturation: v }))}
                  />
                </div>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </div>

              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Editing</div>
                <div className="space-y-2">
                  <Button
                    variant="outline" size="sm" className="w-full text-xs justify-start"
                    onClick={handleHdEnhance} disabled={aiEditing}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> HD Enhance
                  </Button>

                  {!maskMode ? (
                    <Button
                      variant="outline" size="sm" className="w-full text-xs justify-start"
                      onClick={() => setMaskMode(true)} disabled={aiEditing}
                    >
                      <Eraser className="h-3.5 w-3.5 mr-1.5" /> Remove Object
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-md border border-border p-2">
                      <div className="flex items-center gap-1 text-xs font-medium">
                        <Paintbrush className="h-3 w-3" /> Paint over object
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">Brush size: {brushSize}px</label>
                        <Slider
                          min={5} max={80} value={[brushSize]}
                          onValueChange={([v]) => setBrushSize(v)}
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm" variant="default" className="flex-1 text-xs h-7"
                          onClick={handleObjectRemoval} disabled={aiEditing}
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="text-xs h-7"
                          onClick={() => {
                            setMaskMode(false)
                            const mc = maskCanvasRef.current
                            if (mc) {
                              const ctx = mc.getContext('2d')
                              if (ctx) ctx.clearRect(0, 0, mc.width, mc.height)
                            }
                          }}
                        >
                          <LucideX className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">History</div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs" disabled={undoStack.length === 0} onClick={handleUndo}>
                    <Undo2 className="h-3 w-3 mr-1" /> Undo
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1 text-xs" disabled={redoStack.length === 0} onClick={handleRedo}>
                    <Redo2 className="h-3 w-3 mr-1" /> Redo
                  </Button>
                </div>
              </div>

              <div className="mt-auto border-t border-border pt-3">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download PNG
                </Button>
              </div>
            </div>
          )}

          {/* Simple download for video */}
          {isVideo && (
            <div className="w-48 shrink-0 border-l border-border bg-background p-3 flex flex-col gap-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Video</div>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download Video
              </Button>
            </div>
          )}
        </div>

        {/* Gallery strip */}
        {uniqueItems.length > 1 && (
          <div className="shrink-0 border-t border-border bg-background px-3 py-2 flex gap-2 overflow-x-auto">
            {uniqueItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveItemId(item.id)}
                className={`shrink-0 rounded-md border-2 overflow-hidden transition-all ${
                  item.id === activeItemId ? 'border-primary ring-1 ring-primary/30' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {item.type === 'image' ? (
                  <img src={item.dataUrl} alt={item.prompt || ''} className="h-12 w-12 object-cover" />
                ) : (
                  <div className="h-12 w-12 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                    Video
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
