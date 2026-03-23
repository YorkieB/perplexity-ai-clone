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

interface QueryInputProps {
  onSubmit: (query: string, advancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[]) => void
  /** When set, shows a control to run text-to-image with the current textarea prompt. */
  onImageGenerate?: (prompt: string) => void | Promise<void>
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
    const text = query.trim()
    setQuery('')
    void onImageGenerate(text)
  }

  const handleSubmit = () => {
    if ((query.trim() || attachedFiles.length > 0) && !isLoading) {
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

  return (
    <div className="space-y-3">
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
              placeholder={placeholder}
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
              disabled={(!query.trim() && attachedFiles.length === 0) || isLoading}
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
