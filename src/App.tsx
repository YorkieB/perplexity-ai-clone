import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster, toast } from 'sonner'
import { Thread, Workspace, Message as MessageType, Source, UploadedFile, FocusMode, WorkspaceFile, UserSettings } from '@/lib/types'
import { generateId, generateThreadTitle, processFile } from '@/lib/helpers'
import { executeWebSearch, generateFollowUpQuestions, executeModelCouncil } from '@/lib/api'
import { callLlm } from '@/lib/llm'
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
import { TuneInControlProvider } from '@/contexts/TuneInControlContext'
import { BrowserControlProvider, useBrowserControl, useBrowserGuideMode } from '@/contexts/BrowserControlContext'
import { MediaCanvasProvider, useMediaCanvas, useMediaCanvasGenerating } from '@/contexts/MediaCanvasContext'
import { CodeEditorProvider, useCodeEditor } from '@/contexts/CodeEditorContext'
import { MusicPlayerProvider, useMusicPlayer, useMusicPlayerGenerating } from '@/contexts/MusicPlayerContext'
import { MediaCanvasModal } from '@/components/MediaCanvasModal'
const CodeEditorModal = lazy(() => import('@/components/CodeEditorModal').then(m => ({ default: m.CodeEditorModal })))
import { MusicPlayerModal } from '@/components/MusicPlayerModal'
import { runChatWithTools } from '@/lib/chat-tools'
import { useWakeWord } from '@/hooks/useWakeWord'
import { checkAndFireScheduled } from '@/lib/social-scheduler'
import { getAntiHallucinationPrompt } from '@/lib/hallucination-guard'
import { getThinkingPrompt, classifyComplexity } from '@/lib/thinking-engine'
import { getLearnedContext } from '@/lib/learning-engine'

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
  const [mediaCanvasOpen, setMediaCanvasOpen] = useState(false)
  const [codeEditorOpen, setCodeEditorOpen] = useState(false)
  const [musicPlayerOpen, setMusicPlayerOpen] = useState(false)
  const [wakeWordEnabled, setWakeWordEnabled] = useLocalStorage('wake-word-enabled', false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const workspaceFileInputRef = useRef<HTMLInputElement>(null)

  const { isListening: wakeWordListening, isSupported: wakeWordSupported } = useWakeWord({
    enabled: Boolean(wakeWordEnabled) && !voiceModalOpen,
    onWake: () => setVoiceModalOpen(true),
  })

  const browserControl = useBrowserControl()
  const { guideMode: browserGuideMode } = useBrowserGuideMode()
  const mediaCanvasControl = useMediaCanvas()
  const { setGenerating: setMediaGenerating, setGeneratingLabel: setMediaGeneratingLabel } = useMediaCanvasGenerating()
  const codeEditorControl = useCodeEditor()
  const musicPlayerControl = useMusicPlayer()
  const { setGenerating: setMusicGenerating, setGeneratingLabel: setMusicGeneratingLabel } = useMusicPlayerGenerating()

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
    const id = setInterval(() => { void checkAndFireScheduled() }, 30000)
    return () => clearInterval(id)
  }, [])

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

  const handleQuery = async (query: string, useAdvancedMode: boolean, files?: UploadedFile[], useModelCouncil?: boolean, selectedModels?: string[], selectedModel?: string) => {
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
        const thinkingDepth = classifyComplexity(query)
        const learnedContext = await getLearnedContext().catch(() => '')

        const sysPrompt = `You are an advanced AI research assistant.${
          systemPrompt ? ` ${systemPrompt}` : ''
        }${modeInstruction}
${learnedContext ? `\n${learnedContext}\n` : ''}
You have tools available:
- web_search: Search the web for current information.
- browser_action: Control a visible web browser (navigate, click, type, scroll, snapshot, manage tabs).
- browser_task: Execute complex multi-step browser tasks autonomously (research, comparison, data extraction).
- rag_search: Search the personal knowledge base.
- create_document: Create and store documents (md, docx, pdf).
- generate_image: Generate an image from a text description using AI. The image opens in the Media Canvas.
- generate_video: Generate a short video from a text description. The video opens in the Media Canvas.
- edit_image: Edit the current image in the Media Canvas (e.g. "increase contrast", "remove the background", "enhance to HD").
- show_code: Display code in the IDE with syntax highlighting. User can edit, run, copy, and download.
- run_code: Execute Python or JavaScript code and return the output.
- ide_create_file: Create a new file in the IDE (returns file ID).
- ide_edit_file: Replace the entire content of a file by ID.
- ide_replace_text: Find and replace text in the active file — use for fixing errors.
- ide_get_files: List all open files with their IDs.
- ide_read_file: Read a file's content by ID (or the active file).
- ide_open_file: Switch to a specific file tab.
- ide_delete_file: Delete/close a file.
- ide_rename_file: Rename a file.
- ide_run_and_fix: Run the active file, detect errors, and return results for fixing.
- ide_find_in_file: Search for text in the active file (returns line numbers).
- ide_toggle_preview: Toggle the live preview panel for HTML/CSS/JS.
- ide_create_from_template: Create a file from a template (HTML Page, React Component, Python Script, Express Server, CSS Stylesheet, JSON Config, Markdown README, Python Flask API).
- ide_search_all_files: Search across ALL open files for text.
- ide_go_to_line: Jump to a specific line in the active file.
- ide_format_document: Auto-format the current document.
- ide_get_problems: Get errors/warnings from the last run.
- ide_get_terminal_output: Get terminal output history.
- ide_toggle_terminal: Show/hide terminal.
- ide_toggle_zen_mode: Toggle distraction-free zen mode.
- ide_toggle_split_editor: Split editor for side-by-side editing.
- ide_toggle_diff_editor: Compare two files in diff view.
- ide_toggle_explorer: Show/hide file explorer.
- ide_toggle_problems_panel: Show problems panel.
- ide_toggle_search_panel: Show search-across-files panel.
- ide_toggle_outline_panel: Show code outline/symbols.
- ide_toggle_settings_panel: Show IDE settings.
- ide_set_theme: Change theme (jarvis-dark, monokai, dracula, github-dark, one-dark, solarized-dark, vs-light, hc-black).
- ide_get_settings: Get current IDE settings.
- ide_set_font_size: Change font size (10-32).
- ide_set_tab_size: Change tab size.
- ide_set_word_wrap: Toggle word wrap.
- ide_set_minimap: Toggle minimap.
- ide_set_auto_save: Toggle auto-save.
- ide_get_outline: Get code outline (functions, classes, imports).
- ide_get_available_templates: List file templates.
- ide_get_available_themes: List IDE themes.
- search_huggingface: Search Hugging Face for datasets or ML models.
- fetch_dataset_sample: Fetch a preview of rows from a Hugging Face dataset.
- search_github: Search GitHub for repositories or code.
- fetch_github_file: Fetch a file from a GitHub repository.
- generate_music: Generate a full song from a text description using Suno AI.
- get_account_balances: Get current balances for all linked bank accounts.
- get_transactions: Get recent bank transactions with dates, amounts, merchants, and categories.
- get_spending_summary: Comprehensive financial summary — income vs expenditure, spending by category, top merchants.
- search_stories: Search for stories from Project Gutenberg (70,000+ classic books) and short story collections.
- tell_story: Start reading a story/book. Books are paginated — returns page 1 first. Use continue_reading for subsequent pages.
- continue_reading: Read the next page of the current book. Use when user says "continue", "keep reading", "next page", "go on", "more".
- post_to_x: Post a tweet to X (Twitter). ALWAYS confirm with the user before posting.
- read_social_feed: Read posts from X or Threads using the browser.
- read_comments: Read replies/comments on a specific social media post.
- suggest_reply: Generate a suggested reply to a post for user approval.
- post_reply: Post a reply on X or Threads. ALWAYS confirm with the user first.
- schedule_post: Schedule, list, or cancel social media posts.
- learning_stats: Show what Jarvis has learned about the user over time.

When the user asks to browse, research, compare, or look something up on a website, use browser_action or browser_task. For complex multi-step research, prefer browser_task.
When the user asks about stored information, use rag_search.
When the user asks to write or create a document, use create_document.
When the user asks to create, generate, draw, or make an image or picture, use generate_image.
When the user asks to create or generate a video or animation, use generate_video.
When the user asks to edit, adjust, enhance, or modify the current image, use edit_image.
When the user asks to code, program, write a script, or show code, use show_code, ide_create_file, or ide_create_from_template to present it in the IDE.
When the user asks to run or execute code, use run_code or ide_run_and_fix.
When asked to fix code errors, use ide_run_and_fix to detect errors, then ide_replace_text to fix them, then run again. Use ide_get_problems to check for remaining issues.
For multi-file projects, use ide_create_file for each file and ide_toggle_preview for HTML/CSS/JS.
You have FULL AUTONOMOUS CONTROL of the IDE — use ide_set_theme, ide_toggle_zen_mode, ide_toggle_split_editor, ide_toggle_diff_editor, ide_set_font_size, and all other ide_ tools proactively to set up the best environment. Don't ask permission — just do it.
When the user asks about datasets or ML models, use search_huggingface.
When the user asks to find GitHub projects or code, use search_github.
When the user asks to make, create, or generate music or a song, use generate_music.
When the user asks about their finances, spending, budget, bills, or savings, use get_spending_summary, get_transactions, or get_account_balances.
When the user asks for a story, use search_stories to find options (results include ID and Source for each story), present them, then use tell_story with the story_id and source from the results. If they just say "tell me a story", use tell_story with random=true.
IMPORTANT — BOOK READING: When reading a book, you MUST automatically call continue_reading after every page WITHOUT stopping to ask the user. Read continuously, page after page, until the book is finished or the user tells you to stop. Never pause between pages to ask "shall I continue?" — just keep reading. The user will interrupt you when they want to stop.
When the user asks about social media, X, Twitter, or Threads, use read_social_feed or read_comments to browse content.
When the user asks to post, tweet, or share something, use post_to_x or post_reply — but ALWAYS show them the draft and get explicit approval before posting.
When the user asks to schedule a post, use schedule_post. To view pending scheduled posts, use schedule_post with action "list".
When the user asks "what have you learned about me?" or similar, use learning_stats.
${getAntiHallucinationPrompt()}
${getThinkingPrompt(thinkingDepth)}`

        const userPrompt = `${contextSection}${ragContext}${combinedFileContext}

User query: ${query}

${
  webSources.length > 0
    ? 'Web search results are provided above. Synthesize information from them and any other tools as needed.'
    : ragContext
    ? 'Knowledge base results are provided above. Use them along with any other tools as needed.'
    : hasAttachedFileContext
    ? 'Analyze the provided files and answer the user query based on the file content.'
    : 'Answer the query using your knowledge and available tools.'
}`

        const chatModel = selectedModel || 'gpt-4o-mini'
        const { content: response, reasoning } = await runChatWithTools({
          systemPrompt: sysPrompt,
          userPrompt,
          model: chatModel,
          browserControl,
          guideMode: browserGuideMode,
          mediaCanvasControl,
          onMediaGenerating: setMediaGenerating,
          onMediaGeneratingLabel: setMediaGeneratingLabel,
          openMediaCanvas: () => setMediaCanvasOpen(true),
          codeEditorControl,
          openCodeEditor: () => setCodeEditorOpen(true),
          musicPlayerControl,
          openMusicPlayer: () => setMusicPlayerOpen(true),
          onMusicGenerating: setMusicGenerating,
          onMusicGeneratingLabel: setMusicGeneratingLabel,
        })

        const followUpQuestions = await generateFollowUpQuestions(query, response, webSources)

        const assistantMessage: MessageType = {
          id: generateId(),
          role: 'assistant',
          content: response,
          reasoning: reasoning || undefined,
          sources: webSources.length > 0 ? webSources : undefined,
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
    <BrowserControlProvider>
    <MediaCanvasProvider>
    <CodeEditorProvider>
    <MusicPlayerProvider>
    <TuneInControlProvider>
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
        onOpenMediaCanvas={() => setMediaCanvasOpen(true)}
        onOpenCodeEditor={() => setCodeEditorOpen(true)}
        onOpenMusicPlayer={() => setMusicPlayerOpen(true)}
        wakeWordEnabled={Boolean(wakeWordEnabled)}
        wakeWordSupported={wakeWordSupported}
        wakeWordListening={wakeWordListening}
        onWakeWordToggle={setWakeWordEnabled}
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

      <WebBrowserModal open={webBrowserOpen} onOpenChange={setWebBrowserOpen} onRequestOpen={() => setWebBrowserOpen(true)} />

      <MediaCanvasModal open={mediaCanvasOpen} onOpenChange={setMediaCanvasOpen} />

      <Suspense fallback={null}>
        <CodeEditorModal open={codeEditorOpen} onOpenChange={setCodeEditorOpen} />
      </Suspense>

      <MusicPlayerModal open={musicPlayerOpen} onOpenChange={setMusicPlayerOpen} />
    </div>
    </TuneInControlProvider>
    </MusicPlayerProvider>
    </CodeEditorProvider>
    </MediaCanvasProvider>
    </BrowserControlProvider>
  )
}

function App() {
  if (window.location.pathname === '/oauth/callback') {
    return <OAuthCallback />
  }
  return <MainApp />
}

export default App