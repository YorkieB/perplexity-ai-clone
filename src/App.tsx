import { useState, useRef, useEffect } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster, toast } from 'sonner'
import { Thread, Workspace, Message as MessageType, Source, UploadedFile, FocusMode, WorkspaceFile, UserSettings } from '@/lib/types'
import { generateId, generateThreadTitle, processFile } from '@/lib/helpers'
import { executeWebSearch, generateFollowUpQuestions, executeModelCouncil } from '@/lib/api'
import { callLlm } from '@/lib/llm'
import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import { AppSidebar } from '@/components/AppSidebar'
import { EmptyState } from '@/components/EmptyState'
import { Message } from '@/components/Message'
import { MessageSkeleton } from '@/components/MessageSkeleton'
import { QueryInput } from '@/components/QueryInput'
import { WorkspaceDialog } from '@/components/WorkspaceDialog'
import { FocusModeSelector } from '@/components/FocusModeSelector'
import { SettingsDialog } from '@/components/SettingsDialog'
import { OAuthCallback } from '@/components/OAuthCallback'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { FileAttachment } from '@/components/FileAttachment'
import { FilePreviewModal } from '@/components/FilePreviewModal'
import { UploadSimple } from '@phosphor-icons/react'
import { A2EStudioPanel } from '@/components/A2EStudioPanel'
import { AgentBrowserPanel } from '@/components/AgentBrowserPanel'
import { VoiceMode } from '@/components/VoiceMode'
import { WebBrowserModal } from '@/components/WebBrowserModal'
import { AppModuleRails } from '@/components/layout/AppModuleRails'

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
  const [userSettings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)
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
  const [webBrowserOpen, setWebBrowserOpen] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const workspaceFileInputRef = useRef<HTMLInputElement>(null)

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

  const handleNewThread = () => {
    setActiveThreadId(null)
    setActiveWorkspaceId(null)
  }

  const handleThreadSelect = (threadId: string) => {
    const selectedThread = (threads || []).find((thread) => thread.id === threadId)
    setActiveThreadId(threadId)
    setActiveWorkspaceId(selectedThread?.workspaceId ?? null)
  }

  const handleWorkspaceSelect = (workspaceId: string) => {
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

      for (let i = 0; i < inputFiles.length; i++) {
        try {
          const uploadedFile = await processFile(inputFiles[i])
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

  const handleQuery = async (query: string, useAdvancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[]) => {
    setIsGenerating(true)
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
      let webSources: Source[] = []

      if (useWebSearchForQuery) {
        const searchResult = await executeWebSearch(query, focusMode, useAdvancedMode)
        if ('error' in searchResult) {
          toast.error(searchResult.message)
        } else {
          webSources = searchResult
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
        
        const assistantMessage: MessageType = {
          id: generateId(),
          role: 'assistant',
          content: 'Model Council Response',
          sources: webSources.length > 0 ? webSources : undefined,
          createdAt: Date.now(),
          focusMode,
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
        const promptText = `You are an advanced AI research assistant.${
          systemPrompt ? ` ${systemPrompt}` : ''
        }${modeInstruction}${contextSection}${combinedFileContext}

User query: ${query}

${
  webSources.length > 0
    ? 'Using the web search results provided above, give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
    : hasAttachedFileContext
    ? 'Analyze the provided files and answer the user query based on the file content.'
    : 'Provide a helpful, accurate answer based on your knowledge.'
}
`

        const response = await callLlm(promptText, 'gpt-4o-mini')

        const followUpQuestions = await generateFollowUpQuestions(query, response, webSources)

        const assistantMessage: MessageType = {
          id: generateId(),
          role: 'assistant',
          content: response,
          sources: webSources.length > 0 ? webSources : undefined,
          createdAt: Date.now(),
          modelUsed: 'gpt-4o-mini',
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
    }
  }

  const renderMainContent = () => {
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
                {activeThread.messages.length} message{activeThread.messages.length !== 1 ? 's' : ''}
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
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Toaster position="top-center" />
      
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
      />

      <AppModuleRails onOpenSettings={() => setSettingsDialogOpen(true)}>
        <main className="flex-1 overflow-hidden">{renderMainContent()}</main>
      </AppModuleRails>

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

      <WebBrowserModal open={webBrowserOpen} onOpenChange={setWebBrowserOpen} />
    </div>
  )
}

function App() {
  if (window.location.pathname === '/oauth/callback') {
    return <OAuthCallback />
  }
  return <MainApp />
}

export default App