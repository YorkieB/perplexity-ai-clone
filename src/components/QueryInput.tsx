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
} from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SupportedChatModel = 'gpt-4o' | 'gpt-4o-mini'

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionErrorEventLike = Event & {
  error?: string
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/**
 * Web Speech API is typically available only on secure contexts (HTTPS)
 * or localhost during development.
 */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

/**
 * Auto model routing is intentionally simple and local-only:
 * - Attached files -> GPT-4o (more context handling).
 * - Longer/complex prompts -> GPT-4o.
 * - Short prompts -> GPT-4o mini for speed.
 */
function getAutoModelRecommendation(
  query: string,
  files: UploadedFile[]
): { model: SupportedChatModel; reason: string } {
  const trimmed = query.trim()
  const charCount = trimmed.length
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  const hasAttachments = files.length > 0
  const looksComplex =
    /```|compare|trade[- ]?off|step[- ]by[- ]step|architecture|analy[sz]e/i.test(trimmed) ||
    trimmed.includes('\n')

  if (hasAttachments) {
    return {
      model: 'gpt-4o',
      reason: 'attachments detected',
    }
  }

  if (charCount >= 700 || wordCount >= 120 || looksComplex) {
    return {
      model: 'gpt-4o',
      reason: 'long or complex prompt',
    }
  }

  return {
    model: 'gpt-4o-mini',
    reason: 'short prompt',
  }
}

function appendSpeechTranscript(existingDraft: string, transcript: string): string {
  const normalized = transcript.trim()
  if (!normalized) return existingDraft
  if (!existingDraft.trim()) return normalized
  return `${existingDraft}${/\s$/.test(existingDraft) ? '' : ' '}${normalized}`
}

interface QueryInputProps {
  onSubmit: (
    query: string,
    advancedMode: boolean,
    files?: UploadedFile[],
    useModelCouncil?: boolean,
    selectedModels?: string[],
    selectedModel?: SupportedChatModel,
    autoModelEnabled?: boolean
  ) => void
  isLoading?: boolean
  placeholder?: string
  advancedMode: boolean
  onAdvancedModeChange: (enabled: boolean) => void
}

export function QueryInput({
  onSubmit,
  isLoading = false,
  placeholder = 'Ask anything...',
  advancedMode,
  onAdvancedModeChange,
}: QueryInputProps) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedModel, setSelectedModel] = useState<SupportedChatModel>('gpt-4o-mini')
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
  const [autoModelEnabled, setAutoModelEnabled] = useState(false)
  const [autoModelOverride, setAutoModelOverride] = useState<SupportedChatModel | null>(null)
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechDraftBaseRef = useRef('')

  const autoModelRecommendation = getAutoModelRecommendation(query, attachedFiles)
  const modelPickerValue =
    autoModelEnabled && !autoModelOverride ? autoModelRecommendation.model : selectedModel
  const effectiveModel =
    autoModelEnabled && !useModelCouncil
      ? autoModelOverride || autoModelRecommendation.model
      : selectedModel

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

  const handleSubmit = () => {
    if ((query.trim() || attachedFiles.length > 0) && !isLoading) {
      onSubmit(
        query.trim(),
        advancedMode,
        attachedFiles.length > 0 ? attachedFiles : undefined,
        useModelCouncil,
        useModelCouncil ? selectedCouncilModels : undefined,
        effectiveModel,
        autoModelEnabled
      )
      setQuery('')
      setAttachedFiles([])
      setUseModelCouncil(false)
      setAutoModelOverride(null)
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

  const handleModelChange = (value: string) => {
    if (value !== 'gpt-4o' && value !== 'gpt-4o-mini') return
    setSelectedModel(value)
    if (autoModelEnabled) {
      setAutoModelOverride(value === autoModelRecommendation.model ? null : value)
    }
  }

  const handleAutoModelChange = (enabled: boolean) => {
    setAutoModelEnabled(enabled)
    if (!enabled) {
      setAutoModelOverride(null)
    }
  }

  const handleVoiceInput = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop()
      return
    }

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      toast.error('Voice input is not supported in this browser')
      return
    }

    const recognition = new Ctor()
    speechRecognitionRef.current = recognition
    speechDraftBaseRef.current = query
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i]?.[0]?.transcript ?? ''
      }
      // UX choice: append voice transcript to existing draft instead of replacing text.
      setQuery(appendSpeechTranscript(speechDraftBaseRef.current, transcript))
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      const errorMessage =
        event.error === 'not-allowed'
          ? 'Microphone permission denied'
          : event.error === 'no-speech'
          ? 'No speech detected'
          : 'Voice input failed'
      toast.error(errorMessage)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      toast.error('Unable to start voice input')
      setIsListening(false)
    }
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

  useEffect(() => {
    setSpeechRecognitionSupported(Boolean(getSpeechRecognitionCtor()))
  }, [])

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop()
    }
  }, [])

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
            <Select value={modelPickerValue} onValueChange={handleModelChange}>
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

            {speechRecognitionSupported ? (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 hover:bg-muted ${isListening ? 'bg-accent/20 text-accent' : ''}`}
                disabled={isLoading}
                onClick={handleVoiceInput}
                title={isListening ? 'Stop voice input' : 'Start voice input'}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                <Microphone size={16} weight={isListening ? 'fill' : 'regular'} />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled
                title="Voice input not supported in this browser"
                aria-label="Voice input not supported"
              >
                <Microphone size={16} />
              </Button>
            )}

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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-4">
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

          <div className="flex items-center gap-2">
            <Switch
              id="auto-model"
              checked={autoModelEnabled}
              onCheckedChange={handleAutoModelChange}
              disabled={isLoading || useModelCouncil}
            />
            <Label htmlFor="auto-model" className="cursor-pointer text-sm">
              Auto model
            </Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {useModelCouncil
            ? 'Model Council controls model selection while enabled.'
            : autoModelEnabled
            ? autoModelOverride
              ? `Auto model active with manual override: ${
                  autoModelOverride === 'gpt-4o' ? 'GPT-4o' : 'GPT-4o Mini'
                }.`
              : `Auto model selected ${
                  autoModelRecommendation.model === 'gpt-4o' ? 'GPT-4o' : 'GPT-4o Mini'
                } (${autoModelRecommendation.reason}). Local heuristic only.`
            : `Manual model selected: ${selectedModel === 'gpt-4o' ? 'GPT-4o' : 'GPT-4o Mini'}.`}
        </p>
        {!speechRecognitionSupported && (
          <p className="text-xs text-muted-foreground">
            Voice input is not supported in this browser.
          </p>
        )}
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
