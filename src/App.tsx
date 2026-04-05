import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster, toast } from 'sonner'
import { Thread, Workspace, Message as MessageType, Source, UploadedFile, FocusMode, WorkspaceFile, UserSettings } from '@/lib/types'
import { generateId, generateThreadTitle, processFile } from '@/lib/helpers'
import { executeWebSearch, generateFollowUpQuestions, executeModelCouncil } from '@/lib/api'
import { ragSearch } from '@/lib/rag'
import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import { AppSidebar } from '@/components/AppSidebar'
import { EmptyState } from '@/components/EmptyState'
import { Message } from '@/components/Message'
import { MessageSkeleton } from '@/components/MessageSkeleton'
import { QueryInput } from '@/components/QueryInput'
import { WorkspaceDialog } from '@/components/WorkspaceDialog'
import { FocusModeSelector } from '@/components/FocusModeSelector'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ProactiveVisionLoop } from '@/components/ProactiveVisionLoop'
import { OAuthCallback } from '@/components/OAuthCallback'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { FileAttachment } from '@/components/FileAttachment'
import { FilePreviewModal } from '@/components/FilePreviewModal'
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react'
import { A2EStudioPanel } from '@/components/A2EStudioPanel'
import { AgentBrowserPanel } from '@/components/AgentBrowserPanel'
import { VoiceMode } from '@/components/VoiceMode'
import { WebBrowserModal } from '@/components/WebBrowserModal'
import type { InspectorAiRequest, InspectorChatTicket } from '@/browser/types-layout'
import { handleBrowserActGoal } from '@/browser/screen-browser-act'
import { AppModuleRails } from '@/components/layout/AppModuleRails'
import { HealthDashboardPage } from '@/components/HealthDashboardRoute'
import ReasoningDashboardPage from '@/app/dashboard/page'
import { canAccessHealthDashboard, HEALTH_DASHBOARD_403_FLAG } from '@/lib/healthDashboardAccess'
import { TuneInControlProvider } from '@/contexts/TuneInControlContext'
import { BrowserControlProvider, useBrowserControl, useBrowserGuideMode } from '@/contexts/BrowserControlContext'
import { MediaCanvasProvider, useMediaCanvas, useMediaCanvasGenerating } from '@/contexts/MediaCanvasContext'
import { CodeEditorProvider } from '@/contexts/CodeEditorContext'
import { useCodeEditor } from '@/contexts/useCodeEditorHooks'
import { MusicPlayerProvider, useMusicPlayer, useMusicPlayerGenerating } from '@/contexts/MusicPlayerContext'
import { MediaCanvasModal } from '@/components/MediaCanvasModal'
const CodeEditorModal = lazy(() => import('@/components/CodeEditorModal').then(m => ({ default: m.CodeEditorModal })))
import { MusicPlayerModal } from '@/components/MusicPlayerModal'
import { runChatWithTools } from '@/lib/chat-tools'
import { useWakeWord } from '@/hooks/useWakeWord'
import { checkAndFireScheduled } from '@/lib/social-scheduler'
import { classifyComplexity, type ThinkingDepth } from '@/lib/thinking-engine'
import { getLearnedContext } from '@/lib/learning-engine'
import { buildJarvisToolSystemPrompt } from '@/lib/jarvis-tool-system-prompt'
import type { IdeChatPayload } from '@/lib/jarvis-ide-chat-types'
import { presetToInstruction } from '@/lib/jarvis-ide-chat-types'
import { shouldPushUiSync } from '@/lib/ui-sync'
import { buildSearchQueryForFocusMode, dedupeSourcesByNormalizedUrl, getFocusModeLabel } from '@/lib/search-transparency'

const MAX_WORKSPACE_FILES = 12
const MAX_WORKSPACE_FILE_CONTENT_CHARS = 12000

function toWorkspaceFile(file: UploadedFile): WorkspaceFile {
  const isImage = file.type.startsWith('image/')
  const normalizedContent = isImage
    ? `[Image file "${file.name}" omitted from workspace storage to keep local persistence lightweight.]`
    : file.content
  const truncatedContent =
    normalizedContent.length > MAX_WORKSPACE_FILE_CONTENT_CHARS
      ? `${normalizedContent.slice(0, MAX_WORKSPACE_FILE_CONTENT_CHARS)}\n...[truncated for workspace storage]`
      : normalizedContent

  return {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    content: truncatedContent,
    uploadedAt: file.uploadedAt,
  }
}

function MainApp() {
  const [threads, setThreads] = useLocalStorage<Thread[]>('threads', [])
  const [workspaces, setWorkspaces] = useLocalStorage<Workspace[]>('workspaces', [])
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | undefined>()
  const [isGenerating, setIsGenerating] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [focusMode, setFocusMode] = useState<FocusMode>('all')
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [isUploadingWorkspaceFiles, setIsUploadingWorkspaceFiles] = useState(false)
  const [workspacePreviewFile, setWorkspacePreviewFile] = useState<WorkspaceFile | null>(null)
  const [workspacePreviewOpen, setWorkspacePreviewOpen] = useState(false)
  const [a2eStudioOpen, setA2eStudioOpen] = useState(false)
  const [agentBrowserOpen, setAgentBrowserOpen] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [mainView, setMainView] = useState<'chat' | 'dashboard'>('chat')
  const [webBrowserOpen, setWebBrowserOpen] = useState(false)
  const [mediaCanvasOpen, setMediaCanvasOpen] = useState(false)
  const [codeEditorOpen, setCodeEditorOpen] = useState(false)
  const [inspectorChatTicket, setInspectorChatTicket] = useState<InspectorChatTicket | null>(null)
  const inspectorChatNonceRef = useRef(0)
  const [musicPlayerOpen, setMusicPlayerOpen] = useState(false)
  const [wakeWordEnabled, setWakeWordEnabled] = useLocalStorage('wake-word-enabled', false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const workspaceFileInputRef = useRef<HTMLInputElement>(null)

  const { isListening: wakeWordListening, isSupported: wakeWordSupported } = useWakeWord({
    enabled: Boolean(wakeWordEnabled) && !voiceModalOpen,
    onWake: () => setVoiceModalOpen(true),
  })

  useEffect(() => {
    if (!shouldPushUiSync(threads, workspaces, userSettings, Boolean(wakeWordEnabled))) return
    const t = window.setTimeout(() => {
      const entries: Record<string, string> = {}
      try {
        entries['user-settings'] = JSON.stringify(userSettings)
        entries['threads'] = JSON.stringify(threads)
        entries['wake-word-enabled'] = JSON.stringify(wakeWordEnabled)
        entries['workspaces'] = JSON.stringify(workspaces)
      } catch {
        return
      }
      void fetch('/api/ui-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
        credentials: 'same-origin',
      }).catch(() => {})
    }, 2000)
    return () => window.clearTimeout(t)
  }, [threads, userSettings, wakeWordEnabled, workspaces])

  const [mainAutopilot, setMainAutopilot] = useState(false)
  const [mainAutopilotRunning, setMainAutopilotRunning] = useState(false)
  const mainAutopilotAbortRef = useRef<AbortController | null>(null)

  const browserControl = useBrowserControl()
  const { guideMode: browserGuideMode } = useBrowserGuideMode()
  const mediaCanvasControl = useMediaCanvas()
  const { setGenerating: setMediaGenerating, setGeneratingLabel: setMediaGeneratingLabel } = useMediaCanvasGenerating()
  const codeEditorControl = useCodeEditor()
  const codeEditorControlRef = useRef(codeEditorControl)
  codeEditorControlRef.current = codeEditorControl
  const getCodeEditorControl = useRef(() => codeEditorControlRef.current).current
  const musicPlayerControl = useMusicPlayer()
  const { setGenerating: setMusicGenerating, setGeneratingLabel: setMusicGeneratingLabel } = useMusicPlayerGenerating()

  const handleInspectorAiRequest = useCallback((request: InspectorAiRequest) => {
    inspectorChatNonceRef.current += 1
    setInspectorChatTicket({ nonce: inspectorChatNonceRef.current, request })
    setCodeEditorOpen(true)
  }, [])

  const clearInspectorChatTicket = useCallback(() => {
    setInspectorChatTicket(null)
  }, [])

  const activeThread = (threads || []).find((t) => t.id === activeThreadId)
  const contextWorkspaceId = activeWorkspaceId ?? activeThread?.workspaceId ?? null
  const activeWorkspace = (workspaces || []).find((w) => w.id === contextWorkspaceId)
  const globalWebSearchEnabled = userSettings?.includeWebSearch ?? DEFAULT_USER_SETTINGS.includeWebSearch
  const isWorkspaceWebSearchEnabled = activeWorkspace?.includeWebSearch ?? globalWebSearchEnabled

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [activeThread?.messages.length])

  useEffect(() => {
    const id = setInterval(() => { checkAndFireScheduled().catch(() => {}) }, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    try {
      if (globalThis.sessionStorage?.getItem(HEALTH_DASHBOARD_403_FLAG)) {
        globalThis.sessionStorage.removeItem(HEALTH_DASHBOARD_403_FLAG)
        toast.error(
          '403 Forbidden: Health dashboard is only available in development or when VITE_JARVIS_ADMIN_KEY is set (use the same value as server JARVIS_ADMIN_KEY).',
        )
      }
    } catch {
      /* storage blocked */
    }
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (api?.onJarvisBrowserAct === undefined) {
      return
    }
    return api.onJarvisBrowserAct((payload) => {
      if (payload === null || typeof payload !== 'object') {
        return
      }
      const goal = typeof payload.goal === 'string' ? payload.goal : ''
      const rawSlots = payload.slots
      const slots =
        rawSlots !== null && typeof rawSlots === 'object' && !Array.isArray(rawSlots)
          ? (rawSlots as Record<string, string | undefined>)
          : {}
      void handleBrowserActGoal(goal, slots, () => {
        setWebBrowserOpen(true)
      })
    })
  }, [])

  const handleNewThread = () => {
    setMainView('chat')
    setActiveThreadId(null)
    setActiveWorkspaceId(null)
  }

  const handleThreadSelect = (threadId: string) => {
    setMainView('chat')
    const selectedThread = (threads || []).find((thread) => thread.id === threadId)
    setActiveThreadId(threadId)
    setActiveWorkspaceId(selectedThread?.workspaceId ?? null)
  }

  const handleWorkspaceSelect = (workspaceId: string) => {
    setMainView('chat')
    setActiveWorkspaceId(workspaceId)
    setActiveThreadId(null)
  }

  const handleNewWorkspace = () => {
    setEditingWorkspace(undefined)
    setWorkspaceDialogOpen(true)
  }

  const handleSaveWorkspace = (workspaceData: Omit<Workspace, 'id' | 'createdAt'> | Workspace) => {
    if ('id' in workspaceData) {
      setWorkspaces((current) =>
        (current || []).map((w) =>
          w.id === workspaceData.id
            ? {
                ...workspaceData,
                workspaceFiles: workspaceData.workspaceFiles ?? [],
              }
            : w
        )
      )
      toast.success('Workspace updated')
    } else {
      const newWorkspace: Workspace = {
        ...workspaceData,
        // New workspaces inherit global web preference unless explicitly overridden.
        includeWebSearch: workspaceData.includeWebSearch,
        workspaceFiles: workspaceData.workspaceFiles ?? [],
        id: generateId(),
        createdAt: Date.now(),
      }
      setWorkspaces((current) => [...(current || []), newWorkspace])
      toast.success('Workspace created')
    }
  }

  const updateWorkspace = (workspaceId: string, updater: (workspace: Workspace) => Workspace) => {
    setWorkspaces((current) =>
      (current || []).map((workspace) => (workspace.id === workspaceId ? updater(workspace) : workspace))
    )
  }

  const handleWorkspaceWebSearchToggle = (enabled: boolean) => {
    if (!activeWorkspace) return
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      includeWebSearch: enabled,
    }))
  }

  const handleResetWorkspaceWebSearch = () => {
    if (!activeWorkspace) return
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      includeWebSearch: undefined,
    }))
    toast.success('Workspace now inherits global web search setting')
  }

  const handleWorkspaceUploadClick = () => {
    workspaceFileInputRef.current?.click()
  }

  const handleWorkspaceFilePreview = (file: WorkspaceFile) => {
    setWorkspacePreviewFile(file)
    setWorkspacePreviewOpen(true)
  }

  const handleWorkspaceFileRemove = (fileId: string) => {
    if (!activeWorkspace) return
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      workspaceFiles: (workspace.workspaceFiles || []).filter((file) => file.id !== fileId),
    }))
  }

  const handleWorkspaceFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = event.target.files
    if (!inputFiles || inputFiles.length === 0 || !activeWorkspace) return

    setIsUploadingWorkspaceFiles(true)
    try {
      const processedFiles: WorkspaceFile[] = []
      let truncatedCount = 0

      for (const inputFile of inputFiles) {
        try {
          const uploadedFile = await processFile(inputFile)
          const workspaceFile = toWorkspaceFile(uploadedFile)
          if (workspaceFile.content.endsWith('...[truncated for workspace storage]')) {
            truncatedCount += 1
          }
          processedFiles.push(workspaceFile)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to process workspace file')
        }
      }

      if (processedFiles.length === 0) return

      updateWorkspace(activeWorkspace.id, (workspace) => {
        // localStorage has limited quota; cap per-workspace files and keep only the newest refs.
        const merged = [...(workspace.workspaceFiles || []), ...processedFiles]
        const bounded = merged.slice(-MAX_WORKSPACE_FILES)
        return {
          ...workspace,
          workspaceFiles: bounded,
        }
      })

      if ((activeWorkspace.workspaceFiles || []).length + processedFiles.length > MAX_WORKSPACE_FILES) {
        toast.info(`Workspace file cap reached (${MAX_WORKSPACE_FILES}). Kept most recent files.`)
      }
      if (truncatedCount > 0) {
        toast.info(`${truncatedCount} file${truncatedCount > 1 ? 's were' : ' was'} truncated for local storage`)
      }
      toast.success(`${processedFiles.length} workspace file${processedFiles.length > 1 ? 's' : ''} uploaded`)
    } finally {
      setIsUploadingWorkspaceFiles(false)
      if (workspaceFileInputRef.current) {
        workspaceFileInputRef.current.value = ''
      }
    }
  }

  const handleQuery = async (query: string, useAdvancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[], selectedModel?: string, autopilotFlag?: boolean) => {
    setIsGenerating(true)
    const isAutopilot = autopilotFlag === true
    if (isAutopilot) {
      setMainAutopilotRunning(true)
      mainAutopilotAbortRef.current = new AbortController()
    }
    const workspaceForQuery = activeWorkspace
    const useWebSearchForQuery = workspaceForQuery?.includeWebSearch ?? globalWebSearchEnabled
    const workspaceFiles = workspaceForQuery?.workspaceFiles || []

    const userMessage: MessageType = {
      id: generateId(),
      role: 'user',
      content: query,
      files: files,
      createdAt: Date.now(),
      focusMode,
    }

    let thread: Thread
    if (activeThread) {
      thread = {
        ...activeThread,
        messages: [...activeThread.messages, userMessage],
        updatedAt: Date.now(),
      }
      setThreads((current) => (current || []).map((t) => (t.id === thread.id ? thread : t)))
    } else {
      thread = {
        id: generateId(),
        workspaceId: contextWorkspaceId || undefined,
        title: generateThreadTitle(query),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMessage],
      }
      setThreads((current) => [...(current || []), thread])
      setActiveThreadId(thread.id)
    }

    try {
      if (isAutopilot) {
        setCodeEditorOpen(true)
      }

      let webSources: Source[] = []
      let searchTrace: MessageType['searchTrace']

      if (useWebSearchForQuery) {
        const searchQuery = buildSearchQueryForFocusMode(query, focusMode)
        if (import.meta.env.DEV) {
          console.debug('[search] executeWebSearch params', {
            query: searchQuery,
            focusMode,
            advancedMode: useAdvancedMode,
            threadId: thread.id,
          })
        }
        const searchResult = await executeWebSearch(query, focusMode, useAdvancedMode)
        if ('error' in searchResult) {
          toast.error(searchResult.message)
        } else {
          webSources = dedupeSourcesByNormalizedUrl(searchResult)
          if (webSources.length > 0) {
            searchTrace = {
              query: searchQuery,
              focusMode,
              focusModeLabel: getFocusModeLabel(focusMode),
              advancedMode: useAdvancedMode,
              executedAt: Date.now(),
            }
          }
        }
      }

      const systemPrompt = workspaceForQuery?.customSystemPrompt || ''
      const modeInstruction = useAdvancedMode
        ? ' Provide a comprehensive, in-depth analysis with detailed explanations.'
        : ''

      let contextSection = ''
      if (webSources.length > 0) {
        contextSection = `\n\nWeb Search Results:\n${webSources
          .map(
            (source, idx) =>
              `[${idx + 1}] ${source.title}\nURL: ${source.url}\nContent: ${source.snippet}\n`
          )
          .join('\n')}`
      }

      // RAG: retrieve relevant knowledge from the vector store
      let ragContext = ''
      try {
        const ragResults = await ragSearch(query, 5)
        if (ragResults.length > 0) {
          ragContext = `\n\nRetrieved Knowledge:\n${ragResults
            .map((r) => `[From: ${r.document_title}]\n${r.content}`)
            .join('\n---\n')}`
        }
      } catch { /* RAG unavailable — continue without it */ }

      let fileContext = ''
      if (files && files.length > 0) {
        fileContext = `\n\nAttached Files:\n${files
          .map(
            (file) =>
              `File: ${file.name} (${file.type})\nContent: ${
                file.content.length > 2000 ? file.content.substring(0, 2000) + '...' : file.content
              }\n`
          )
          .join('\n')}`
      }

      let workspaceFileContext = ''
      if (workspaceFiles.length > 0) {
        workspaceFileContext = `\n\nWorkspace Files:\n${workspaceFiles
          .map(
            (file) =>
              `File: ${file.name} (${file.type})\nContent: ${
                file.content.length > 2000 ? `${file.content.substring(0, 2000)}...` : file.content
              }\n`
          )
          .join('\n')}`
      }

      const combinedFileContext = `${workspaceFileContext}${fileContext}`
      const hasAttachedFileContext = (files && files.length > 0) || workspaceFiles.length > 0

      if (useModelCouncil) {
        const councilResult = await executeModelCouncil(
          query,
          contextSection,
          combinedFileContext,
          systemPrompt + modeInstruction,
          selectedModels
        )
        const councilForFollowUps = councilResult.models
          .map((model, index) => `Model ${String(index + 1)} (${model.model}): ${model.content}`)
          .join('\n\n')
        const followUpQuestions = await generateFollowUpQuestions(query, councilForFollowUps, webSources)

        const assistantMessage: MessageType = {
          id: generateId(),
          role: 'assistant',
          content: 'Model Council Response',
          sources: webSources.length > 0 ? webSources : undefined,
          searchTrace,
          createdAt: Date.now(),
          focusMode,
          followUpQuestions,
          isModelCouncil: true,
          modelResponses: councilResult.models.map(m => ({
            ...m,
            convergenceScore: councilResult.convergence.score,
          })),
        }

        setThreads((current) =>
          (current || []).map((t) =>
            t.id === thread.id
              ? {
                  ...t,
                  messages: [...t.messages, assistantMessage],
                  updatedAt: Date.now(),
                }
              : t
          )
        )
      } else {
        const thinkingDepth = classifyComplexity(query)
        const learnedContext = await getLearnedContext().catch(() => '')

        const sysPrompt = buildJarvisToolSystemPrompt({
          workspaceSystemPrompt: systemPrompt,
          modeInstruction,
          learnedContext,
          thinkingDepth,
          autopilot: isAutopilot,
        })

        let sourceGuidance: string
        if (webSources.length > 0) {
          sourceGuidance = 'Web search results are provided above. Synthesize information from them and any other tools as needed.'
        } else if (ragContext) {
          sourceGuidance = 'Knowledge base results are provided above. Use them along with any other tools as needed.'
        } else if (hasAttachedFileContext) {
          sourceGuidance = 'Analyze the provided files and answer the user query based on the file content.'
        } else {
          sourceGuidance = 'Answer the query using your knowledge and available tools.'
        }

        const autopilotHint = isAutopilot
          ? '\n\nYou are in AUTOPILOT mode. Work autonomously — plan, code, run, fix, iterate. Do not ask permission. End with [AUTOPILOT: COMPLETED], [AUTOPILOT: CONTINUING], or [AUTOPILOT: BLOCKED].'
          : ''

        const userPrompt = `${contextSection}${ragContext}${combinedFileContext}

User query: ${query}

${sourceGuidance}${autopilotHint}`

        const chatModel = selectedModel || 'gpt-4o-mini'

        const runOnce = async (prompt: string) => {
          return runChatWithTools({
            systemPrompt: sysPrompt,
            userPrompt: prompt,
            model: chatModel,
            browserControl,
            guideMode: browserGuideMode,
            mediaCanvasControl,
            onMediaGenerating: setMediaGenerating,
            onMediaGeneratingLabel: setMediaGeneratingLabel,
            openMediaCanvas: () => setMediaCanvasOpen(true),
            codeEditorControl,
            getCodeEditorControl,
            openCodeEditor: () => setCodeEditorOpen(true),
            musicPlayerControl,
            openMusicPlayer: () => setMusicPlayerOpen(true),
            onMusicGenerating: setMusicGenerating,
            onMusicGeneratingLabel: setMusicGeneratingLabel,
            maxRounds: isAutopilot ? 60 : undefined,
            signal: isAutopilot ? mainAutopilotAbortRef.current?.signal : undefined,
            userSettings,
            setUserSettings,
          })
        }

        let { content: response, reasoning } = await runOnce(userPrompt)

        if (isAutopilot) {
          let continuations = 0
          const maxContinuations = 10
          while (
            continuations < maxContinuations &&
            response.includes('[AUTOPILOT: CONTINUING]') &&
            !mainAutopilotAbortRef.current?.signal.aborted
          ) {
            continuations++
            const contMsg: MessageType = {
              id: generateId(),
              role: 'assistant',
              content: response,
              reasoning: reasoning || undefined,
              createdAt: Date.now(),
              modelUsed: chatModel,
              focusMode,
            }
            setThreads((current) =>
              (current || []).map((t) =>
                t.id === thread.id ? { ...t, messages: [...t.messages, contMsg], updatedAt: Date.now() } : t
              )
            )
            const contResult = await runOnce(
              `Continue your autonomous work (continuation ${String(continuations)}). Pick up where you left off.\n\n${autopilotHint}`
            )
            response = contResult.content
            reasoning = contResult.reasoning
          }
        }

        const followUpQuestions = await generateFollowUpQuestions(query, response, webSources)

        const assistantMessage: MessageType = {
          id: generateId(),
          role: 'assistant',
          content: response,
          reasoning: reasoning || undefined,
          sources: webSources.length > 0 ? webSources : undefined,
          searchTrace,
          createdAt: Date.now(),
          modelUsed: chatModel,
          focusMode,
          followUpQuestions,
        }

        setThreads((current) =>
          (current || []).map((t) =>
            t.id === thread.id
              ? {
                  ...t,
                  messages: [...t.messages, assistantMessage],
                  updatedAt: Date.now(),
                }
              : t
          )
        )
      }
    } catch (error) {
      toast.error('Failed to generate response. Please try again.')
      console.error(error)
    } finally {
      setIsGenerating(false)
      if (isAutopilot) {
        setMainAutopilotRunning(false)
        mainAutopilotAbortRef.current = null
      }
    }
  }

  const stopMainAutopilot = () => {
    mainAutopilotAbortRef.current?.abort()
    setMainAutopilotRunning(false)
    toast.info('Autopilot stopped')
  }

  const handleIdeChat = async (payload: IdeChatPayload): Promise<{ content: string; reasoning?: string }> => {
    const workspaceForQuery = activeWorkspace
    const systemPrompt = workspaceForQuery?.customSystemPrompt || ''
    const modeInstruction = advancedMode
      ? ' Provide a comprehensive, in-depth analysis with detailed explanations.'
      : ''
    const presetExtra = payload.preset ? `\n\n[System instruction for this action]\n${presetToInstruction(payload.preset)}` : ''
    let thinkingDepth: ThinkingDepth
    if (payload.reasoningMode === 'off') thinkingDepth = 'quick'
    else if (payload.reasoningMode === 'full') thinkingDepth = 'deep'
    else if (payload.reasoningMode === 'minimal') thinkingDepth = 'standard'
    else thinkingDepth = classifyComplexity(payload.userMessage)
    const learnedContext = await getLearnedContext().catch(() => '')

    let ragContext = ''
    try {
      const ragResults = await ragSearch(`${payload.userMessage}\n${payload.ideContextBlock.slice(0, 800)}`, 4)
      if (ragResults.length > 0) {
        ragContext = `\n\nRetrieved Knowledge:\n${ragResults
          .map((r) => `[From: ${r.document_title}]\n${r.content}`)
          .join('\n---\n')}`
      }
    } catch {
      /* RAG optional */
    }

    const sysPrompt = buildJarvisToolSystemPrompt({
      workspaceSystemPrompt: systemPrompt,
      modeInstruction,
      learnedContext,
      thinkingDepth,
      autopilot: payload.autopilot,
    })

    const autopilotHint = payload.autopilot
      ? '\n\nYou are in AGENT mode. Work autonomously — plan, code, run, fix, iterate. Do not ask permission. End with [AUTOPILOT: COMPLETED], [AUTOPILOT: CONTINUING], or [AUTOPILOT: BLOCKED].'
      : ''

    const modeHint = payload.mode === 'composer' && !payload.autopilot
      ? '\n\n[Composer mode] Analyse the request carefully. First show a clear step-by-step plan of what files to change and how. Only apply changes when the user confirms or explicitly asks you to apply.'
      : ''

    const attachmentContext = payload.attachments?.length
      ? `\n\n## Attached context\n${payload.attachments
          .map((a) =>
            a.isImage
              ? `[Image attached: ${a.name}]`
              : `### ${a.name}\n\`\`\`\n${a.content.slice(0, 10000)}\n\`\`\``
          )
          .join('\n\n')}`
      : ''

    const userPrompt = `${ragContext}

## Jarvis IDE — current session
${payload.ideContextBlock}${attachmentContext}

User message: ${payload.userMessage}${presetExtra}

You are assisting from the IDE chat panel. Prefer ide_* tools for editor actions. For git operations use git_* tools. Answer the user's question and use tools as needed.${autopilotHint}${modeHint}`

    const chatModel = payload.model?.trim() || 'gpt-4o-mini'
    const isAutopilot = payload.autopilot === true
    const { content, reasoning } = await runChatWithTools({
      systemPrompt: sysPrompt,
      userPrompt,
      model: chatModel,
      temperature: payload.temperature,
      max_tokens: isAutopilot ? Math.max(payload.max_tokens ?? 4096, 8192) : payload.max_tokens,
      maxRounds: isAutopilot ? 60 : undefined,
      browserControl,
      guideMode: browserGuideMode,
      mediaCanvasControl,
      onMediaGenerating: setMediaGenerating,
      onMediaGeneratingLabel: setMediaGeneratingLabel,
      openMediaCanvas: () => setMediaCanvasOpen(true),
      codeEditorControl,
      getCodeEditorControl,
      openCodeEditor: () => setCodeEditorOpen(true),
      musicPlayerControl,
      openMusicPlayer: () => setMusicPlayerOpen(true),
      onMusicGenerating: setMusicGenerating,
      onMusicGeneratingLabel: setMusicGeneratingLabel,
      userSettings,
      setUserSettings,
    })

    return { content, reasoning: reasoning || undefined }
  }

  const renderMainContent = () => {
    if (mainView === 'dashboard') {
      return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMainView('chat')}>
              ← Chat
            </Button>
            <span className="text-sm text-muted-foreground">Jarvis Reasoning Dashboard</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <ReasoningDashboardPage />
          </div>
        </div>
      )
    }

    if (activeWorkspace && !activeThread) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{activeWorkspace.name}</h2>
              {activeWorkspace.description && (
                <p className="text-muted-foreground">{activeWorkspace.description}</p>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Custom System Prompt</h3>
              <div className="p-4 bg-card border border-border rounded-lg">
                <p className="text-sm whitespace-pre-wrap">
                  {activeWorkspace.customSystemPrompt || 'No custom prompt set'}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Workspace Web Search</h3>
                  <p className="text-xs text-muted-foreground">
                    Workspace override takes precedence over global setting when active.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="workspace-web-search"
                    checked={isWorkspaceWebSearchEnabled}
                    onCheckedChange={handleWorkspaceWebSearchToggle}
                  />
                  <Label htmlFor="workspace-web-search" className="text-sm">
                    {isWorkspaceWebSearchEnabled ? 'Enabled' : 'Disabled'}
                  </Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {activeWorkspace.includeWebSearch === undefined ? 'Inheriting global default' : 'Workspace override'}
                </Badge>
                {activeWorkspace.includeWebSearch !== undefined && (
                  <Button variant="ghost" size="sm" onClick={handleResetWorkspaceWebSearch}>
                    Use global default
                  </Button>
                )}
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Workspace Files</h3>
                  <p className="text-xs text-muted-foreground">
                    Files are saved locally for this workspace and automatically added to prompts.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleWorkspaceUploadClick}
                  disabled={isUploadingWorkspaceFiles}
                >
                  <UploadSimple size={16} />
                  {isUploadingWorkspaceFiles ? 'Uploading...' : 'Upload files'}
                </Button>
              </div>
              <input
                ref={workspaceFileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="text/plain,text/markdown,text/csv,application/json,application/pdf,image/jpeg,image/png,image/gif,image/webp"
                onChange={handleWorkspaceFileSelect}
                disabled={isUploadingWorkspaceFiles}
              />
              {(activeWorkspace.workspaceFiles || []).length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
                  No files attached to this workspace yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(activeWorkspace.workspaceFiles || []).map((file) => (
                    <FileAttachment
                      key={file.id}
                      file={file}
                      onRemove={() => handleWorkspaceFileRemove(file.id)}
                      onPreview={() => handleWorkspaceFilePreview(file)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="pt-4">
              <QueryInput
                onSubmit={handleQuery}
                isLoading={isGenerating}
                placeholder={`Ask a question in ${activeWorkspace.name}...`}
                advancedMode={advancedMode || false}
                onAdvancedModeChange={setAdvancedMode}
                onVoiceOpen={() => setVoiceModalOpen(true)}
                autopilot={mainAutopilot}
                onToggleAutopilot={() => setMainAutopilot((p) => !p)}
                onStopAutopilot={stopMainAutopilot}
                autopilotRunning={mainAutopilotRunning}
              />
            </div>
          </div>
        </div>
      )
    }

    if (activeThread) {
      return (
        <div className="flex flex-col h-screen">
          <div className="border-b border-border bg-background px-6 py-3">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <FocusModeSelector value={focusMode} onChange={setFocusMode} disabled={isGenerating} />
              <span className="text-sm text-muted-foreground">
                {activeThread.messages.length} message{activeThread.messages.length === 1 ? '' : 's'}
              </span>
              {activeWorkspace && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <Badge variant="secondary">{activeWorkspace.name}</Badge>
                  <Badge variant={isWorkspaceWebSearchEnabled ? 'default' : 'outline'}>
                    Web {isWorkspaceWebSearchEnabled ? 'On' : 'Off'}
                  </Badge>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full" ref={scrollAreaRef}>
              <div className="max-w-4xl mx-auto px-6 py-8">
                {activeThread.messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    onFollowUpClick={(q) => handleQuery(q, advancedMode)}
                    isGenerating={isGenerating}
                  />
                ))}
                {isGenerating && <MessageSkeleton />}
              </div>
            </ScrollArea>
          </div>

          <div className="border-t border-border bg-background">
            <div className="max-w-4xl mx-auto px-6 py-4">
              <QueryInput
                onSubmit={handleQuery}
                isLoading={isGenerating}
                advancedMode={advancedMode || false}
                onAdvancedModeChange={setAdvancedMode}
                onVoiceOpen={() => setVoiceModalOpen(true)}
                autopilot={mainAutopilot}
                onToggleAutopilot={() => setMainAutopilot((p) => !p)}
                onStopAutopilot={stopMainAutopilot}
                autopilotRunning={mainAutopilotRunning}
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-screen">
        <div className="border-b border-border bg-background px-6 py-3">
          <div className="max-w-2xl mx-auto">
            <FocusModeSelector value={focusMode} onChange={setFocusMode} disabled={isGenerating} />
          </div>
        </div>
        <EmptyState onExampleClick={(query) => handleQuery(query, advancedMode)} />
        <div className="border-t border-border bg-background">
          <div className="max-w-2xl mx-auto px-6 py-6">
            <QueryInput
              onSubmit={handleQuery}
              isLoading={isGenerating}
              advancedMode={advancedMode}
              onAdvancedModeChange={setAdvancedMode}
              onVoiceOpen={() => setVoiceModalOpen(true)}
              autopilot={mainAutopilot}
              onToggleAutopilot={() => setMainAutopilot((p) => !p)}
              onStopAutopilot={stopMainAutopilot}
              autopilotRunning={mainAutopilotRunning}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserControlProvider>
    <MediaCanvasProvider>
    <CodeEditorProvider>
    <MusicPlayerProvider>
    <TuneInControlProvider>
    <div className="flex h-screen overflow-hidden">
      <Toaster position="top-center" />
      <ProactiveVisionLoop />

      <AppModuleRails onOpenSettings={() => setSettingsDialogOpen(true)}>
        <main className="flex-1 overflow-hidden min-w-0">{renderMainContent()}</main>
      </AppModuleRails>

      <AppSidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        activeThreadId={activeThreadId}
        activeWorkspaceId={activeWorkspaceId}
        onThreadSelect={handleThreadSelect}
        onWorkspaceSelect={handleWorkspaceSelect}
        onNewThread={handleNewThread}
        onNewWorkspace={handleNewWorkspace}
        onOpenSettings={() => setSettingsDialogOpen(true)}
        threads={threads || []}
        workspaces={workspaces || []}
        onDeleteThread={(id) => {
          setThreads((cur) => (cur || []).filter((t) => t.id !== id))
          if (activeThreadId === id) setActiveThreadId(null)
        }}
        onDeleteWorkspace={(id) => {
          setWorkspaces((cur) => (cur || []).filter((w) => w.id !== id))
          if (activeWorkspaceId === id) setActiveWorkspaceId(null)
        }}
        onOpenA2eStudio={() => setA2eStudioOpen(true)}
        onOpenWebBrowser={() => setWebBrowserOpen(true)}
        onOpenAgentBrowser={() => setAgentBrowserOpen(true)}
        onOpenVoice={() => setVoiceModalOpen(true)}
        onOpenMediaCanvas={() => setMediaCanvasOpen(true)}
        onOpenCodeEditor={() => setCodeEditorOpen(true)}
        onOpenMusicPlayer={() => setMusicPlayerOpen(true)}
        wakeWordEnabled={Boolean(wakeWordEnabled)}
        wakeWordSupported={wakeWordSupported}
        wakeWordListening={wakeWordListening}
        onWakeWordToggle={setWakeWordEnabled}
        reasoningDashboardActive={mainView === 'dashboard'}
        onOpenReasoningDashboard={() => setMainView('dashboard')}
      />

      <WorkspaceDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
        workspace={editingWorkspace}
        onSave={handleSaveWorkspace}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      <FilePreviewModal
        file={workspacePreviewFile}
        open={workspacePreviewOpen}
        onOpenChange={setWorkspacePreviewOpen}
      />

      <A2EStudioPanel open={a2eStudioOpen} onOpenChange={setA2eStudioOpen} />

      <AgentBrowserPanel open={agentBrowserOpen} onOpenChange={setAgentBrowserOpen} />

      <VoiceMode
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
      />

      <WebBrowserModal
        open={webBrowserOpen}
        onOpenChange={setWebBrowserOpen}
        onRequestOpen={() => setWebBrowserOpen(true)}
        onInspectorAiRequest={handleInspectorAiRequest}
      />

      <MediaCanvasModal open={mediaCanvasOpen} onOpenChange={setMediaCanvasOpen} />

      <Suspense fallback={null}>
        <CodeEditorModal
          open={codeEditorOpen}
          onOpenChange={setCodeEditorOpen}
          ideChatOnSend={handleIdeChat}
          onOpenAgentBrowser={() => setAgentBrowserOpen(true)}
          inspectorChatTicket={inspectorChatTicket}
          onInspectorChatConsumed={clearInspectorChatTicket}
        />
      </Suspense>

      <MusicPlayerModal open={musicPlayerOpen} onOpenChange={setMusicPlayerOpen} />

      {canAccessHealthDashboard() ? (
        <a
          href="/health"
          className="fixed bottom-2 right-2 z-[100] rounded px-1.5 py-0.5 text-[10px] tracking-tight text-zinc-500 opacity-40 transition-opacity hover:opacity-90 hover:text-zinc-400"
          title="Observability dashboard (dev or admin key)"
        >
          health
        </a>
      ) : null}
    </div>
    </TuneInControlProvider>
    </MusicPlayerProvider>
    </CodeEditorProvider>
    </MediaCanvasProvider>
    </BrowserControlProvider>
  )
}

function App() {
  const path = globalThis.location.pathname
  if (path === '/oauth/callback') {
    return <OAuthCallback />
  }
  if (path === '/health') {
    return <HealthDashboardPage />
  }
  if (path === '/dashboard') {
    return <ReasoningDashboardPage />
  }
  return <MainApp />
}

export default App