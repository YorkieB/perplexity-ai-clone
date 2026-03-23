import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { CloudFile, UploadedFile } from '@/lib/types'
import { processFile } from '@/lib/helpers'
import { FileAttachment } from '@/components/FileAttachment'
import { FilePreviewModal } from '@/components/FilePreviewModal'
import { ModelCouncilSelector } from '@/components/ModelCouncilSelector'
import { CloudFileBrowser } from '@/components/CloudFileBrowser'
import { FileAnalysisDialog } from '@/components/FileAnalysisDialog'
import {
  Lightning,
  Plus,
  UploadSimple,
  CloudArrowUp,
  Plugs,
  MagnifyingGlass,
  Hammer,
  DotsThree,
  FilePlus,
  GraduationCap,
  CaretRight,
  Microphone,
  Waveform,
  Desktop,
  ImageSquare,
} from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVoiceSession } from '@/contexts/VoiceSessionContext'
import type { ImageGenerationPayload } from '@/lib/image/apiTypes'
import { IMAGE_MAX_REFERENCE_BYTES, IMAGE_MAX_REFERENCES } from '@/lib/image/limits'
import { Checkbox } from '@/components/ui/checkbox'

interface QueryInputProps {
  onSubmit: (query: string, advancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[]) => void
  /** When set, Image mode submit calls this instead of chat search (photoreal, edits, references). */
  onImageGenerate?: (payload: ImageGenerationPayload) => void | Promise<void>
  isLoading?: boolean
  placeholder?: string
  advancedMode: boolean
  onAdvancedModeChange: (enabled: boolean) => void
}

export function QueryInput({
  onSubmit,
  onImageGenerate,
  isLoading = false,
  placeholder = 'Ask anything...',
  advancedMode,
  onAdvancedModeChange,
}: QueryInputProps) {
  const voice = useVoiceSession()
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini')
  const [moreExpanded, setMoreExpanded] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([])
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [useModelCouncil, setUseModelCouncil] = useState(false)
  const [modelCouncilDialogOpen, setModelCouncilDialogOpen] = useState(false)
  const [selectedCouncilModels, setSelectedCouncilModels] = useState<string[]>(['gpt-4o', 'gpt-4o-mini'])
  const [cloudBrowserOpen, setCloudBrowserOpen] = useState(false)
  const [fileAnalysisOpen, setFileAnalysisOpen] = useState(false)
  const [fileToAnalyze, setFileToAnalyze] = useState<UploadedFile | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)

  const [imageMode, setImageMode] = useState(false)
  const [photoreal, setPhotoreal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [referenceImages, setReferenceImages] = useState<Array<{ base64: string; mimeType: string; name: string }>>([])
  const [referenceRightsConfirmed, setReferenceRightsConfirmed] = useState(false)

  const handleFilePreview = (file: UploadedFile) => {
    setPreviewFile(file)
    setPreviewOpen(true)
  }

  const handleFileAnalyze = (file: UploadedFile) => {
    setFileToAnalyze(file)
    setFileAnalysisOpen(true)
  }

  const handleCloudFilesImport = (files: CloudFile[]) => {
    const processedFiles: UploadedFile[] = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      content: `[Cloud file from ${file.source}]\nPath: ${file.path}\nSize: ${(file.size / 1024).toFixed(2)} KB\nLast modified: ${new Date(file.modifiedAt).toLocaleDateString()}`,
      uploadedAt: Date.now(),
    }))
    setAttachedFiles((prev) => [...prev, ...processedFiles])
  }

  const handleImageGenerateClick = () => {
    if (!onImageGenerate || !query.trim() || isLoading) return
    if (!imageMode) {
      toast.error('Turn on Image mode in the composer first.')
      return
    }
    handleSubmit()
  }

  const handleSubmit = () => {
    if (isLoading) return

    if (imageMode && onImageGenerate) {
      const prompt = query.trim()
      if (!prompt) {
        toast.error('Enter a prompt for image generation.')
        return
      }
      if (editMode) {
        if (referenceImages.length === 0) {
          toast.error('Add at least one PNG reference image for edit mode.')
          return
        }
        if (!referenceRightsConfirmed) {
          toast.error('Confirm you have rights to use the reference images.')
          return
        }
      }
      const payload: ImageGenerationPayload = {
        prompt,
        photoreal,
        editMode,
        references: referenceImages.map(({ base64, mimeType }) => ({ base64, mimeType })),
        referenceRightsConfirmed: editMode ? referenceRightsConfirmed : false,
      }
      void Promise.resolve(onImageGenerate(payload)).then(() => {
        setQuery('')
        if (!editMode) {
          setReferenceImages([])
          setReferenceRightsConfirmed(false)
        }
      })
      return
    }

    if (query.trim() || attachedFiles.length > 0) {
      onSubmit(query.trim(), advancedMode, attachedFiles.length > 0 ? attachedFiles : undefined, useModelCouncil, useModelCouncil ? selectedCouncilModels : undefined)
      setQuery('')
      setAttachedFiles([])
      setUseModelCouncil(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploadingFile(true)

    try {
      const newFiles: UploadedFile[] = []
      
      for (let i = 0; i < files.length; i++) {
        try {
          const processedFile = await processFile(files[i])
          newFiles.push(processedFile)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to process file')
        }
      }

      setAttachedFiles((prev) => [...prev, ...newFiles])
      
      if (newFiles.length > 0) {
        toast.success(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} uploaded`)
      }
    } finally {
      setIsUploadingFile(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleRefImagesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    const next: Array<{ base64: string; mimeType: string; name: string }> = []
    for (let i = 0; i < files.length && next.length < IMAGE_MAX_REFERENCES; i++) {
      const file = files[i]
      if (file.type !== 'image/png') {
        toast.error(`${file.name} is not PNG. Edits require PNG.`)
        continue
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error('read failed'))
        r.readAsDataURL(file)
      })
      const comma = dataUrl.indexOf(',')
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'))
      const base64 = dataUrl.slice(comma + 1)
      const approxBytes = Math.floor((base64.length * 3) / 4)
      if (approxBytes > IMAGE_MAX_REFERENCE_BYTES) {
        toast.error(`${file.name} is too large.`)
        continue
      }
      next.push({ base64, mimeType, name: file.name })
    }
    setReferenceImages((prev) => [...prev, ...next].slice(0, IMAGE_MAX_REFERENCES))
    if (refImageInputRef.current) refImageInputRef.current.value = ''
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === '/' && query === '') {
      e.preventDefault()
      setShowSuggestions(true)
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [query])

  const canSubmit =
    imageMode && onImageGenerate
      ? query.trim().length > 0
      : query.trim().length > 0 || attachedFiles.length > 0

  const effectivePlaceholder =
    imageMode && onImageGenerate ? 'Describe the image to generate…' : placeholder

  return (
    <div className="space-y-3">
      {onImageGenerate && (
        <div className="rounded-lg border border-border bg-card/50 px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="image-mode"
                checked={imageMode}
                onCheckedChange={(v) => {
                  setImageMode(v)
                  if (v) setUseModelCouncil(false)
                }}
                disabled={isLoading}
              />
              <Label htmlFor="image-mode" className="text-sm cursor-pointer">
                Image generation
              </Label>
            </div>
            {imageMode && (
              <>
                <div className="flex items-center gap-2">
                  <Switch id="photoreal" checked={photoreal} onCheckedChange={setPhotoreal} disabled={isLoading} />
                  <Label htmlFor="photoreal" className="text-sm cursor-pointer">
                    Photoreal (HD)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="edit-mode"
                    checked={editMode}
                    onCheckedChange={(v) => {
                      setEditMode(v)
                      if (!v) {
                        setReferenceImages([])
                        setReferenceRightsConfirmed(false)
                      }
                    }}
                    disabled={isLoading}
                  />
                  <Label htmlFor="edit-mode" className="text-sm cursor-pointer">
                    Reference PNG (edit)
                  </Label>
                </div>
              </>
            )}
          </div>
          {imageMode && editMode && (
            <div className="space-y-2 border-t border-border pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refImageInputRef.current?.click()}
                disabled={isLoading}
              >
                Add PNG reference
              </Button>
              <input
                ref={refImageInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                multiple
                onChange={handleRefImagesSelected}
              />
              {referenceImages.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  {referenceImages.map((r) => (
                    <li key={r.name}>{r.name}</li>
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ref-rights"
                  checked={referenceRightsConfirmed}
                  onCheckedChange={(c) => setReferenceRightsConfirmed(c === true)}
                />
                <Label htmlFor="ref-rights" className="text-xs leading-snug cursor-pointer">
                  I have the rights to use these reference images for generation.
                </Label>
              </div>
            </div>
          )}
        </div>
      )}
      {useModelCouncil && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
          <Hammer size={16} className="text-primary" weight="fill" />
          <span className="text-sm text-primary font-medium">
            Model Council Active: {selectedCouncilModels.length} models
          </span>
          <button
            onClick={() => setUseModelCouncil(false)}
            className="ml-auto text-primary hover:text-primary/80 transition-colors"
          >
            <span className="text-xs underline">Disable</span>
          </button>
        </div>
      )}
      <div className="relative bg-card border border-border rounded-xl shadow-sm">
        <div className="flex items-start gap-2 p-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mt-1 flex-shrink-0 hover:bg-muted"
                disabled={isLoading}
              >
                <Plus size={18} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-2"
              align="start"
              side="top"
              sideOffset={8}
            >
              <div className="space-y-1">
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={handleUploadClick}
                  disabled={isUploadingFile}
                >
                  <UploadSimple size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Upload files or images</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {
                    setCloudBrowserOpen(true)
                  }}
                >
                  <CloudArrowUp size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Add files from cloud</span>
                  <CaretRight size={14} className="text-muted-foreground" />
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {}}
                >
                  <Plugs size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Connectors and sources</span>
                  <CaretRight size={14} className="text-muted-foreground" />
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {}}
                >
                  <MagnifyingGlass size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Deep research</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-accent/10 text-accent border-accent/20">
                    New
                  </Badge>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {
                    setModelCouncilDialogOpen(true)
                  }}
                >
                  <Hammer size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Model council</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20">
                    Max
                  </Badge>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => setMoreExpanded(!moreExpanded)}
                >
                  <DotsThree size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">More</span>
                  <CaretRight
                    size={14}
                    className={`text-muted-foreground transition-transform ${
                      moreExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {moreExpanded && (
                  <div className="pl-8 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm text-muted-foreground">
                      Additional options...
                    </button>
                  </div>
                )}

                <Separator className="my-1" />

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {}}
                >
                  <FilePlus size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Create files and apps</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-accent/10 text-accent border-accent/20">
                    New
                  </Badge>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  onClick={() => {}}
                >
                  <GraduationCap size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">Learn step by step</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0">
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map((file) => (
                  <FileAttachment
                    key={file.id}
                    file={file}
                    onRemove={() => handleRemoveFile(file.id)}
                    onPreview={() => handleFilePreview(file)}
                    onAnalyze={() => handleFileAnalyze(file)}
                  />
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={effectivePlaceholder}
              className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base leading-relaxed"
              disabled={isLoading}
              id="query-input"
              rows={1}
            />
            {showSuggestions && query === '' && (
              <div className="mt-2 text-xs text-muted-foreground">
                Show suggestions
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="text/plain,text/markdown,text/csv,application/json,application/pdf,image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            disabled={isLoading || isUploadingFile}
          />

          <div className="flex items-center gap-1 flex-shrink-0">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 border-0 bg-transparent hover:bg-muted text-xs w-auto px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted"
              disabled={isLoading}
            >
              <Desktop size={16} />
            </Button>

            {onImageGenerate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                disabled={!query.trim() || isLoading}
                onClick={handleImageGenerateClick}
                aria-label="Generate image from prompt"
              >
                <ImageSquare size={16} weight="regular" />
              </Button>
            ) : null}

            <Button
              type="button"
              variant={voice.isVoiceConnected ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 hover:bg-muted"
              disabled={isLoading || voice.isVoiceConnecting}
              onClick={() => {
                if (voice.isVoiceConnected || voice.isVoiceConnecting) {
                  voice.stopVoice()
                } else {
                  void voice.startVoice()
                }
              }}
              aria-label={
                voice.isVoiceConnected || voice.isVoiceConnecting
                  ? 'Stop voice session'
                  : 'Start voice conversation'
              }
              aria-pressed={voice.isVoiceConnected}
            >
              <Microphone size={16} weight={voice.isVoiceConnected ? 'fill' : 'regular'} />
            </Button>

            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!canSubmit || isLoading}
              className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Waveform size={16} weight="fill" />
            </Button>
          </div>
        </div>

        <div className="px-3 pb-2 flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-2 mt-1">
          <span>Type / for search modes and shortcuts</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="advanced-mode"
          checked={advancedMode}
          onCheckedChange={onAdvancedModeChange}
          disabled={isLoading}
        />
        <Label
          htmlFor="advanced-mode"
          className="flex items-center gap-2 cursor-pointer text-sm"
        >
          <Lightning size={16} weight={advancedMode ? 'fill' : 'regular'} className="text-accent" />
          <span>Enable Advanced Analysis</span>
        </Label>
      </div>

      <FilePreviewModal file={previewFile} open={previewOpen} onOpenChange={setPreviewOpen} />
      
      <FileAnalysisDialog file={fileToAnalyze} open={fileAnalysisOpen} onOpenChange={setFileAnalysisOpen} />
      
      <CloudFileBrowser open={cloudBrowserOpen} onOpenChange={setCloudBrowserOpen} onSelectFiles={handleCloudFilesImport} />
      
      <ModelCouncilSelector
        open={modelCouncilDialogOpen}
        onOpenChange={setModelCouncilDialogOpen}
        defaultSelected={selectedCouncilModels}
        onConfirm={(models) => {
          setSelectedCouncilModels(models)
          setUseModelCouncil(true)
          toast.success(`Model Council enabled with ${models.length} models`)
        }}
      />
    </div>
  )
}
