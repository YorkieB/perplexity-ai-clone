import { useState, useRef, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Toaster, toast } from 'sonner'
import { Thread, Workspace, Message as MessageType, Source } from '@/lib/types'
import { generateId, generateThreadTitle } from '@/lib/helpers'
import { AppSidebar } from '@/components/AppSidebar'
import { EmptyState } from '@/components/EmptyState'
import { Message } from '@/components/Message'
import { MessageSkeleton } from '@/components/MessageSkeleton'
import { QueryInput } from '@/components/QueryInput'
import { WorkspaceDialog } from '@/components/WorkspaceDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

function App() {
  const [threads, setThreads] = useKV<Thread[]>('threads', [])
  const [workspaces, setWorkspaces] = useKV<Workspace[]>('workspaces', [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | undefined>()
  const [isGenerating, setIsGenerating] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

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

  const handleQuery = async (query: string, useAdvancedMode: boolean) => {
    setIsGenerating(true)

    const userMessage: MessageType = {
      id: generateId(),
      role: 'user',
      content: query,
      createdAt: Date.now(),
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
      const systemPrompt = activeWorkspace?.customSystemPrompt || ''
      const modeInstruction = useAdvancedMode
        ? ' Provide a comprehensive, in-depth analysis with detailed explanations.'
        : ''

      const promptText = `You are an advanced AI research assistant.${
        systemPrompt ? ` ${systemPrompt}` : ''
      }${modeInstruction}

User query: ${query}

Provide a helpful, accurate answer. After your response, provide 2-3 relevant sources in the following JSON format at the very end:

SOURCES:
${JSON.stringify([
  {
    url: 'https://example.com',
    title: 'Example Source Title',
    snippet: 'Brief relevant excerpt',
  },
])}
`

      const response = await window.spark.llm(promptText, 'gpt-4o-mini')

      const sourcesMatch = response.match(/SOURCES:\s*(\[[\s\S]*\])/i)
      let content = response
      let sources: Source[] = []

      if (sourcesMatch) {
        content = response.substring(0, sourcesMatch.index).trim()
        try {
          sources = JSON.parse(sourcesMatch[1])
        } catch {
          sources = []
        }
      }

      const assistantMessage: MessageType = {
        id: generateId(),
        role: 'assistant',
        content,
        sources: sources.length > 0 ? sources : undefined,
        createdAt: Date.now(),
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
              />
            </div>
          </div>
        </div>
      )
    }

    if (activeThread) {
      return (
        <div className="flex flex-col h-screen">
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full" ref={scrollAreaRef}>
              <div className="max-w-4xl mx-auto px-6 py-8">
                {activeThread.messages.map((message) => (
                  <Message key={message.id} message={message} />
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
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-screen">
        <EmptyState onExampleClick={(query) => handleQuery(query, advancedMode)} />
        <div className="border-t border-border bg-background">
          <div className="max-w-2xl mx-auto px-6 py-6">
            <QueryInput
              onSubmit={handleQuery}
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
      />

      <main className="flex-1 overflow-hidden">{renderMainContent()}</main>

      <WorkspaceDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
        workspace={editingWorkspace}
        onSave={handleSaveWorkspace}
      />
    </div>
  )
}

export default App