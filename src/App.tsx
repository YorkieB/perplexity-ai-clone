import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster, toast } from 'sonner'
import {
  Thread,
  Workspace,
  Message as MessageType,
  Source,
  UploadedFile,
  FocusMode,
  UserSettings,
  DEFAULT_USER_SETTINGS,
} from '@/lib/types'
import { generateId, generateThreadTitle } from '@/lib/helpers'
import { executeWebSearch, generateFollowUpQuestions, executeModelCouncil } from '@/lib/api'
import { callLlm } from '@/lib/llm'
import {
  buildAssistantSystemContent,
  buildPriorLlmMessages,
  type AssistantSystemContentParams,
} from '@/lib/threadContext'
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
import { ThreadExportActions } from '@/components/ThreadExportActions'

function MainApp() {
  const [threads, setThreads] = useLocalStorage<Thread[]>('threads', [])
  const [workspaces, setWorkspaces] = useLocalStorage<Workspace[]>('workspaces', [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | undefined>()
  const [isGenerating, setIsGenerating] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [focusMode, setFocusMode] = useState<FocusMode>('all')
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)
  const includeWebSearch = userSettings?.includeWebSearch !== false

  const handleIncludeWebSearchChange = useCallback((enabled: boolean) => {
    setUserSettings((current) => ({
      ...(current ?? DEFAULT_USER_SETTINGS),
      includeWebSearch: enabled,
    }))
  }, [setUserSettings])

  useEffect(() => {
    if (!includeWebSearch) {
      setFocusMode('all')
    }
  }, [includeWebSearch])

  const handleClearAllThreads = useCallback(() => {
    setThreads([])
    setActiveThreadId(null)
    toast.success('All conversations cleared')
  }, [setThreads])

  const handleClearAllWorkspaces = useCallback(() => {
    setWorkspaces([])
    setActiveWorkspaceId(null)
    toast.success('All workspaces cleared')
  }, [setWorkspaces])

  const activeThread = (threads || []).find((t) => t.id === activeThreadId)
  const activeWorkspace = (workspaces || []).find((w) => w.id === activeWorkspaceId)
  const threadWorkspaceName = activeThread?.workspaceId
    ? (workspaces || []).find((w) => w.id === activeThread.workspaceId)?.name
    : undefined

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
    setActiveThreadId(threadId)
    setActiveWorkspaceId(null)
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
        (current || []).map((w) => (w.id === workspaceData.id ? workspaceData : w))
      )
      toast.success('Workspace updated')
    } else {
      const newWorkspace: Workspace = {
        ...workspaceData,
        id: generateId(),
        createdAt: Date.now(),
      }
      setWorkspaces((current) => [...(current || []), newWorkspace])
      toast.success('Workspace created')
    }
  }

  const handleQuery = async (query: string, useAdvancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[]) => {
    setIsGenerating(true)

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
        workspaceId: activeWorkspaceId || undefined,
        title: generateThreadTitle(query),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMessage],
      }
      setThreads((current) => [...(current || []), thread])
      setActiveThreadId(thread.id)
    }

    try {
      const shouldSearchWeb = includeWebSearch
      let webSources: Source[] = []

      if (shouldSearchWeb) {
        const searchResult = await executeWebSearch(query, focusMode, useAdvancedMode)
        if ('error' in searchResult) {
          toast.error(searchResult.message)
        } else {
          webSources = searchResult
        }
      }

      const systemPrompt = activeWorkspace?.customSystemPrompt || ''
      const modeInstruction = useAdvancedMode
        ? ' Provide a comprehensive, in-depth analysis with detailed explanations.'
        : ''

      const assistantSystem: AssistantSystemContentParams = {
        globalAnswer: {
          answerRole: userSettings?.answerRole,
          answerTone: userSettings?.answerTone,
          answerStructure: userSettings?.answerStructure,
          answerConstraints: userSettings?.answerConstraints,
        },
        workspaceAndMode: `${systemPrompt}${modeInstruction}`,
      }

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

      if (useModelCouncil) {
        const councilResult = await executeModelCouncil(
          query,
          contextSection,
          fileContext,
          assistantSystem,
          selectedModels,
          thread.messages.slice(0, -1)
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
        const taskInstruction =
          webSources.length > 0
            ? 'Using the web search results provided above (and prior conversation when relevant), give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
            : files && files.length > 0
              ? 'Analyze the provided files and answer the user query based on the file content and prior conversation when relevant.'
              : 'Provide a helpful, accurate answer based on your knowledge and the conversation so far.'

        const currentUserContent = `${contextSection}${fileContext}

User query: ${query}

${taskInstruction}`

        const systemContent = buildAssistantSystemContent(assistantSystem)

        const prior = buildPriorLlmMessages(thread.messages.slice(0, -1))

        const response = await callLlm({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemContent }, ...prior, { role: 'user', content: currentUserContent }],
        })

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
          <div className="max-w-2xl w-full space-y-6">
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
            <div className="pt-4">
              <QueryInput
                onSubmit={handleQuery}
                isLoading={isGenerating}
                placeholder={`Ask a question in ${activeWorkspace.name}...`}
                advancedMode={advancedMode || false}
                onAdvancedModeChange={setAdvancedMode}
                includeWebSearch={includeWebSearch}
                onIncludeWebSearchChange={handleIncludeWebSearchChange}
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
            <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FocusModeSelector
                  value={focusMode}
                  onChange={setFocusMode}
                  disabled={isGenerating}
                  webSearchEnabled={includeWebSearch}
                />
                <span className="text-sm text-muted-foreground">
                  {activeThread.messages.length} message{activeThread.messages.length !== 1 ? 's' : ''}
                </span>
              </div>
              <ThreadExportActions
                thread={activeThread}
                workspaceName={threadWorkspaceName}
                disabled={isGenerating}
              />
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
                includeWebSearch={includeWebSearch}
                onIncludeWebSearchChange={handleIncludeWebSearchChange}
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
            <FocusModeSelector
              value={focusMode}
              onChange={setFocusMode}
              disabled={isGenerating}
              webSearchEnabled={includeWebSearch}
            />
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
              includeWebSearch={includeWebSearch}
              onIncludeWebSearchChange={handleIncludeWebSearchChange}
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
      />

      <main className="flex-1 overflow-hidden">{renderMainContent()}</main>

      <WorkspaceDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
        workspace={editingWorkspace}
        onSave={handleSaveWorkspace}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onClearAllThreads={handleClearAllThreads}
        onClearAllWorkspaces={handleClearAllWorkspaces}
      />
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