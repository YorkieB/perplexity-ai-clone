import { useState, KeyboardEvent, useRef, useEffect, useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { CloudFile, UploadedFile, UserSettings } from '@/lib/types'
import { processFile } from '@/lib/helpers'
import { ragIngestBulk } from '@/lib/rag'
import { fetchDigitalOceanModels, type DigitalOceanModelOption } from '@/lib/digitalocean-api'
import { useLocalStorage } from '@/hooks/useLocalStorage'
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
  Brain,
} from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface QueryInputProps {
  readonly onSubmit: (
    query: string,
    advancedMode: boolean,
    deepResearchMode: boolean,
    files?: UploadedFile[],
    useModelCouncil?: boolean,
    selectedModels?: string[],
    selectedModel?: string,
    autopilot?: boolean
  ) => void
  readonly isLoading?: boolean
  readonly placeholder?: string
  readonly advancedMode: boolean
  readonly onAdvancedModeChange: (enabled: boolean) => void
  readonly deepResearchMode: boolean
  readonly onDeepResearchModeChange: (enabled: boolean) => void
  readonly deepResearchDisabledReason?: string
  readonly isDeepResearchRunning?: boolean
  readonly onCancelDeepResearch?: () => void
  readonly onVoiceOpen?: () => void
  readonly autopilot?: boolean
  readonly onToggleAutopilot?: () => void
  readonly onStopAutopilot?: () => void
  readonly autopilotRunning?: boolean
}

export function QueryInput({
  onSubmit,
  isLoading = false,
  placeholder = 'Ask anything...',
  advancedMode,
  onAdvancedModeChange,
  deepResearchMode,
  onDeepResearchModeChange,
  deepResearchDisabledReason,
  isDeepResearchRunning = false,
  onCancelDeepResearch,
  onVoiceOpen,
  autopilot = false,
  onToggleAutopilot,
  onStopAutopilot,
  autopilotRunning = false,
}: QueryInputProps) {
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
  const [doModels, setDoModels] = useState<DigitalOceanModelOption[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [settings] = useLocalStorage<UserSettings>('user-settings', { apiKeys: {}, oauthTokens: {}, oauthClientIds: {}, oauthClientSecrets: {}, connectedServices: { googledrive: false, onedrive: false, github: false, dropbox: false, spotify: false } })
  const useEnvInference = Boolean(import.meta.env.VITE_USE_DO_INFERENCE)
  const doToken = settings?.apiKeys?.digitalOcean?.trim()
  const useDigitalOcean = Boolean(doToken) || useEnvInference

  useEffect(() => {
    if (!useDigitalOcean) { setDoModels([]); return }
    let cancelled = false
    fetchDigitalOceanModels(doToken || undefined)
      .then((list) => { 
        if (!cancelled) {
          setDoModels(list)
          if (list.length === 0) {
            console.warn('[QueryInput] No DigitalOcean models available, using fallback')
          }
        }
      })
    return () => { cancelled = true }
  }, [useDigitalOcean, doToken])

  const modelOptions = useMemo(() => {
    const openai = [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ]
    const doItems = doModels.map((m) => ({
      id: `do:${m.id}`,
      label: m.name,
    }))
    return [...openai, ...doItems]
  }, [doModels])

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
        deepResearchMode,
        attachedFiles.length > 0 ? attachedFiles : undefined,
        useModelCouncil,
        useModelCouncil ? selectedCouncilModels : undefined,
        selectedModel,
        autopilot
      )
      setQuery('')
      setAttachedFiles([])
      setUseModelCouncil(false)
    }
  }

  const handleDeepResearchToggle = (next: boolean) => {
    if (deepResearchDisabledReason && next) {
      toast.info(deepResearchDisabledReason)
      return
    }
    onDeepResearchModeChange(next)
    if (next) {
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

  const ragFileInputRef = useRef<HTMLInputElement>(null)
  const [isIngestingRag, setIsIngestingRag] = useState(false)

  const handleRagUploadClick = () => {
    ragFileInputRef.current?.click()
  }

  const handleRagFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setIsIngestingRag(true)
    const toastId = toast.loading(`Ingesting ${files.length} file${files.length > 1 ? 's' : ''} into Knowledge Base...`)
    try {
      const result = await ragIngestBulk(files)
      const ok = result.results.length
      const fail = result.errors.length
      if (ok > 0 && fail === 0) {
        toast.success(`${ok} file${ok > 1 ? 's' : ''} saved to Knowledge Base`, { id: toastId })
      } else if (ok > 0 && fail > 0) {
        toast.success(`${ok} saved, ${fail} failed`, { id: toastId })
      } else {
        toast.error(`Failed: ${result.errors.map(e => e.filename).join(', ')}`, { id: toastId })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ingest failed', { id: toastId })
    } finally {
      setIsIngestingRag(false)
      if (ragFileInputRef.current) ragFileInputRef.current.value = ''
    }
  }

  const handleVoiceOpen = () => {
    if (onVoiceOpen) onVoiceOpen()
    else toast.info('Voice mode is not available in this view.')
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
        <div className="flex flex-wrap items-start gap-2 p-3">
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
                  onClick={handleRagUploadClick}
                  disabled={isIngestingRag}
                >
                  <Brain size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">
                    {isIngestingRag ? 'Ingesting...' : 'Save to Knowledge Base'}
                  </span>
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
                  onClick={() => {
                    if (deepResearchDisabledReason && !deepResearchMode) {
                      toast.info(deepResearchDisabledReason)
                      return
                    }
                    const next = !deepResearchMode
                    handleDeepResearchToggle(next)
                    if (next) {
                      toast.success('Deep research enabled')
                    }
                  }}
                >
                  <MagnifyingGlass size={18} className="text-muted-foreground" />
                  <span className="flex-1 text-left">
                    {deepResearchMode ? 'Deep research (On)' : 'Deep research'}
                  </span>
                  {deepResearchMode ? (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20">
                      On
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-accent/10 text-accent border-accent/20">
                      New
                    </Badge>
                  )}
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

          <div className="flex-1 min-w-0 min-h-[40px]">
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
          <input
            ref={ragFileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleRagFileSelect}
            disabled={isIngestingRag}
          />

          <div className="flex flex-wrap items-center justify-end gap-1 flex-shrink-0 min-w-0 sm:ml-auto">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 border-0 bg-transparent hover:bg-muted text-xs w-auto max-w-[12rem] px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted shrink-0"
              disabled={isLoading}
            >
              <Desktop size={16} />
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

        <div className="px-3 pb-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Type / for search modes and shortcuts
            </span>
            {onToggleAutopilot && (
              <button
                type="button"
                onClick={onToggleAutopilot}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
                style={{
                  borderColor: autopilot ? '#22c55e50' : undefined,
                  background: autopilot ? '#22c55e18' : undefined,
                  color: autopilot ? '#22c55e' : undefined,
                }}
                title={autopilot ? 'Disable autopilot mode' : 'Enable autopilot — Jarvis works autonomously'}
              >
                {autopilot ? '⏸' : '▶'} Autopilot
                {autopilot && autopilotRunning && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
              </button>
            )}
            {autopilot && autopilotRunning && onStopAutopilot && (
              <button
                type="button"
                onClick={onStopAutopilot}
                className="rounded-md border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-500/10"
              >
                ■ Stop
              </button>
            )}
            {isDeepResearchRunning && onCancelDeepResearch && (
              <button
                type="button"
                onClick={onCancelDeepResearch}
                className="rounded-md border border-amber-500/30 px-2 py-1 text-[11px] font-bold text-amber-500 hover:bg-amber-500/10"
              >
                ■ Stop deep research
              </button>
            )}
          </div>
          <button
            type="button"
            id="query-input-voice"
            data-testid="voice-mode-button"
            disabled={isLoading}
            onClick={handleVoiceOpen}
            title="Voice mode — speak to the assistant"
            aria-label="Open voice mode"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
          >
            <Microphone size={16} weight="fill" className="text-primary-foreground" aria-hidden />
            <span>Voice</span>
          </button>
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
          <span>Advanced analysis (single-pass deep answer)</span>
        </Label>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Switch
            id="deep-research-mode"
            checked={deepResearchMode}
            onCheckedChange={handleDeepResearchToggle}
            disabled={isLoading || Boolean(deepResearchDisabledReason && !deepResearchMode)}
          />
          <Label
            htmlFor="deep-research-mode"
            className="flex items-center gap-2 cursor-pointer text-sm"
          >
            <MagnifyingGlass size={16} className="text-accent" />
            <span>Deep research (plan → multi-search → synthesize)</span>
          </Label>
        </div>
        <p className="text-xs text-muted-foreground pl-8">
          {deepResearchDisabledReason || 'Runs 3-5 focused web searches with progress tracking before final synthesis.'}
        </p>
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
