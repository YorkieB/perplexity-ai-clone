import { useState, useRef, useEffect, useCallback } from 'react'
import type { ComponentProps } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster, toast } from 'sonner'
import { Thread, Workspace, Message as MessageType, Source, UploadedFile, FocusMode } from '@/lib/types'
import { generateId, generateThreadTitle } from '@/lib/helpers'
import { executeWebSearch, generateFollowUpQuestions, executeModelCouncil } from '@/lib/api'
import { callLlm } from '@/lib/llm'
import { generateImagesFromText } from '@/lib/image'
import { ImageGenerationError } from '@/lib/image/errors'
import { AppSidebar } from '@/components/AppSidebar'
import { EmptyState } from '@/components/EmptyState'
import { Message } from '@/components/Message'
import { MessageSkeleton } from '@/components/MessageSkeleton'
import { QueryInput } from '@/components/QueryInput'
import { VoiceSessionBar } from '@/components/VoiceSessionBar'
import { WorkspaceDialog } from '@/components/WorkspaceDialog'
import { FocusModeSelector } from '@/components/FocusModeSelector'
import { SettingsDialog } from '@/components/SettingsDialog'
import { OAuthCallback } from '@/components/OAuthCallback'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { VoiceSessionProvider } from '@/contexts/VoiceSessionContext'

function QueryInputWithVoice(props: ComponentProps<typeof QueryInput>) {
  return (
    <div className="space-y-3 w-full">
      <VoiceSessionBar />
      <QueryInput {...props} />
    </div>
  )
}

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
  const activeThreadIdRef = useRef<string | null>(null)
  const activeWorkspaceIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  const activeThread = (threads || []).find((t) => t.id === activeThreadId)
  const activeWorkspace = (workspaces || []).find((w) => w.id === activeWorkspaceId)

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
      const searchResult = await executeWebSearch(query, focusMode, useAdvancedMode)
      
      let webSources: Source[] = []
      
      if ('error' in searchResult) {
        toast.error(searchResult.message)
      } else {
        webSources = searchResult
      }

      const systemPrompt = activeWorkspace?.customSystemPrompt || ''
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

      if (useModelCouncil) {
        const councilResult = await executeModelCouncil(query, contextSection, fileContext, systemPrompt + modeInstruction, selectedModels)
        
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
        }${modeInstruction}${contextSection}${fileContext}

User query: ${query}

${
  webSources.length > 0
    ? 'Using the web search results provided above, give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
    : files && files.length > 0
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

  const handleImageGeneration = async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed.length) return

    setIsGenerating(true)

    const userMessage: MessageType = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
      focusMode,
      modality: 'image',
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
        title: generateThreadTitle(trimmed),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMessage],
      }
      setThreads((current) => [...(current || []), thread])
      setActiveThreadId(thread.id)
    }

    try {
      const images = await generateImagesFromText(trimmed, {
        width: 1024,
        height: 1024,
        n: 1,
      })

      const assistantMessage: MessageType = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        modelUsed: 'dall-e-2',
        focusMode,
        generatedImages: images,
        imageGeneration: { status: 'complete' },
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
    } catch (error) {
      const messageText =
        error instanceof ImageGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Image generation failed.'

      toast.error(messageText)

      const assistantMessage: MessageType = {
        id: generateId(),
        role: 'assistant',
        content: `Could not generate an image. ${messageText}`,
        createdAt: Date.now(),
        focusMode,
        imageGeneration: { status: 'failed', errorMessage: messageText },
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
      console.error(error)
    } finally {
      setIsGenerating(false)
    }
  }

  const appendVoiceUserMessage = useCallback(
    (text: string) => {
      const userMessage: MessageType = {
        id: generateId(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
        focusMode,
        modality: 'voice',
        source: 'voice',
        voiceTurn: { source: 'voice' },
      }
      setThreads((current) => {
        const list = current || []
        const tid = activeThreadIdRef.current
        if (!tid) {
          const threadId = generateId()
          activeThreadIdRef.current = threadId
          const thread: Thread = {
            id: threadId,
            workspaceId: activeWorkspaceIdRef.current ?? undefined,
            title: generateThreadTitle(text),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [userMessage],
          }
          queueMicrotask(() => setActiveThreadId(threadId))
          return [...list, thread]
        }
        return list.map((t) =>
          t.id === tid ? { ...t, messages: [...t.messages, userMessage], updatedAt: Date.now() } : t
        )
      })
    },
    [focusMode, setThreads]
  )

  const appendVoiceAssistantMessage = useCallback(
    (text: string, meta: { interrupted: boolean }) => {
      const assistantMessage: MessageType = {
        id: generateId(),
        role: 'assistant',
        content: text,
        createdAt: Date.now(),
        modelUsed: 'gpt-realtime',
        focusMode,
        modality: 'voice',
        source: 'voice',
        voiceTurn: { source: 'voice', interrupted: meta.interrupted },
      }
      setThreads((current) => {
        const list = current || []
        const tid = activeThreadIdRef.current
        if (!tid) {
          return list
        }
        return list.map((t) =>
          t.id === tid
            ? { ...t, messages: [...t.messages, assistantMessage], updatedAt: Date.now() }
            : t
        )
      })
    },
    [focusMode, setThreads]
  )

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
              <QueryInputWithVoice
                onSubmit={handleQuery}
                onImageGenerate={handleImageGeneration}
                isLoading={isGenerating}
                placeholder={`Ask a question in ${activeWorkspace.name}...`}
                advancedMode={advancedMode || false}
                onAdvancedModeChange={setAdvancedMode}
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
              <QueryInputWithVoice
                onSubmit={handleQuery}
                onImageGenerate={handleImageGeneration}
                isLoading={isGenerating}
                advancedMode={advancedMode || false}
                onAdvancedModeChange={setAdvancedMode}
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
            <QueryInputWithVoice
              onSubmit={handleQuery}
              onImageGenerate={handleImageGeneration}
              isLoading={isGenerating}
              advancedMode={advancedMode}
              onAdvancedModeChange={setAdvancedMode}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <VoiceSessionProvider
      onUserTranscript={appendVoiceUserMessage}
      onAssistantTranscript={appendVoiceAssistantMessage}
    >
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
        />
      </div>
    </VoiceSessionProvider>
  )
}

function App() {
  if (window.location.pathname === '/oauth/callback') {
    return <OAuthCallback />
  }
  return <MainApp />
}

export default App