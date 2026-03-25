import { useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { 
  List, 
  Plus, 
  ChatCircle, 
  Folder,
  CaretDown,
  CaretRight,
  Gear,
  Microphone,
  GlobeSimple,
  Robot,
  FilmSlate,
  Trash,
  PaintBrush,
  Code,
  MusicNotes,
} from '@phosphor-icons/react'
import { Thread, Workspace } from '@/lib/types'
import { formatTimestamp } from '@/lib/helpers'
import { cn } from '@/lib/utils'
import { useBrowserGuideMode } from '@/contexts/BrowserControlContext'

interface AppSidebarProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
  activeThreadId: string | null
  activeWorkspaceId: string | null
  onThreadSelect: (threadId: string) => void
  onWorkspaceSelect: (workspaceId: string) => void
  onNewThread: () => void
  onNewWorkspace: () => void
  onOpenSettings: () => void
  threads?: Thread[]
  workspaces?: Workspace[]
  onDeleteThread?: (id: string) => void
  onDeleteWorkspace?: (id: string) => void
  onOpenA2eStudio?: () => void
  onOpenWebBrowser?: () => void
  onOpenAgentBrowser?: () => void
  onOpenMediaCanvas?: () => void
  onOpenCodeEditor?: () => void
  onOpenMusicPlayer?: () => void
  onOpenVoice?: () => void
  wakeWordEnabled?: boolean
  wakeWordSupported?: boolean
  wakeWordListening?: boolean
  onWakeWordToggle?: (enabled: boolean) => void
}

export function AppSidebar({
  isCollapsed,
  onToggleCollapse,
  activeThreadId,
  activeWorkspaceId,
  onThreadSelect,
  onWorkspaceSelect,
  onNewThread,
  onNewWorkspace,
  onOpenSettings,
  threads: threadsProp,
  workspaces: workspacesProp,
  onDeleteThread,
  onDeleteWorkspace,
  onOpenA2eStudio,
  onOpenWebBrowser,
  onOpenAgentBrowser,
  onOpenMediaCanvas,
  onOpenCodeEditor,
  onOpenMusicPlayer,
  onOpenVoice,
  wakeWordEnabled,
  wakeWordSupported,
  wakeWordListening,
  onWakeWordToggle,
}: AppSidebarProps) {
  const [storedThreads] = useLocalStorage<Thread[]>('threads', [])
  const [storedWorkspaces] = useLocalStorage<Workspace[]>('workspaces', [])
  const threads = threadsProp ?? storedThreads
  const workspaces = workspacesProp ?? storedWorkspaces
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const { guideMode, setGuideMode } = useBrowserGuideMode()

  const sortedThreads = [...(threads || [])].sort((a, b) => b.updatedAt - a.updatedAt)
  const activeWorkspace = (workspaces || []).find((workspace) => workspace.id === activeWorkspaceId)
  const visibleThreads = activeWorkspaceId
    ? sortedThreads.filter((thread) => thread.workspaceId === activeWorkspaceId)
    : sortedThreads
  const workspaceNames = new Map((workspaces || []).map((workspace) => [workspace.id, workspace.name]))

  return (
    <div
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-3 flex items-center justify-between border-b border-border">
        {!isCollapsed && (
          <h1 className="text-lg font-semibold tracking-tight">AI Search</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8"
        >
          <List size={20} />
        </Button>
      </div>

      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            <Collapsible open={libraryOpen} onOpenChange={setLibraryOpen}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 w-full justify-start px-2">
                    {libraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
                    <span className="text-sm font-medium">Library</span>
                  </Button>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNewThread}
                  className="h-7 w-7"
                >
                  <Plus size={16} />
                </Button>
              </div>
              <CollapsibleContent className="mt-2 space-y-1">
                {activeWorkspace && (
                  <p className="text-xs text-muted-foreground px-2 pb-1">
                    Showing threads in <span className="font-medium text-foreground">{activeWorkspace.name}</span>
                  </p>
                )}
                {visibleThreads.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-4">
                    {activeWorkspace ? 'No threads in this workspace yet' : 'No threads yet'}
                  </p>
                ) : (
                  visibleThreads.map((thread) => (
                    <Button
                      key={thread.id}
                      variant={activeThreadId === thread.id ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => onThreadSelect(thread.id)}
                      className={cn(
                        'w-full justify-start gap-2 h-auto py-2 px-2',
                        activeThreadId === thread.id && 'border-l-2 border-accent rounded-l-none'
                      )}
                    >
                      <ChatCircle size={16} className="shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm truncate">{thread.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            {formatTimestamp(thread.updatedAt)}
                          </p>
                          {!activeWorkspaceId && thread.workspaceId && workspaceNames.get(thread.workspaceId) && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {workspaceNames.get(thread.workspaceId)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            <Collapsible open={workspacesOpen} onOpenChange={setWorkspacesOpen}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 w-full justify-start px-2">
                    {workspacesOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
                    <span className="text-sm font-medium">Workspaces</span>
                  </Button>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNewWorkspace}
                  className="h-7 w-7"
                >
                  <Plus size={16} />
                </Button>
              </div>
              <CollapsibleContent className="mt-2 space-y-1">
                {(workspaces || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-4">No workspaces yet</p>
                ) : (
                  (workspaces || []).map((workspace) => (
                    <Button
                      key={workspace.id}
                      variant={activeWorkspaceId === workspace.id ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => onWorkspaceSelect(workspace.id)}
                      className={cn(
                        'w-full justify-start gap-2 h-auto py-2 px-2',
                        activeWorkspaceId === workspace.id && 'border-l-2 border-accent rounded-l-none'
                      )}
                    >
                      <Folder size={16} className="shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm truncate">{workspace.name}</p>
                      </div>
                    </Button>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center gap-4 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewThread}
            className="h-10 w-10"
          >
            <ChatCircle size={20} />
          </Button>
          <Separator />
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewWorkspace}
            className="h-10 w-10"
          >
            <Folder size={20} />
          </Button>
        </div>
      )}


      {!isCollapsed && (
        <div className="px-3 pb-2 space-y-1">
          <Separator className="mb-2" />
          <p className="text-xs text-muted-foreground px-2 pb-1 font-medium">Tools</p>
          {onOpenVoice && (
            <Button variant="ghost" size="sm" onClick={onOpenVoice} className="w-full justify-start gap-2 px-2">
              <Microphone size={16} />
              <span className="text-sm">Voice Mode</span>
            </Button>
          )}
          {onWakeWordToggle && (
            <button
              type="button"
              onClick={() => onWakeWordToggle(!wakeWordEnabled)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                wakeWordEnabled
                  ? 'text-foreground hover:bg-muted'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="relative flex size-4 items-center justify-center">
                <Microphone size={14} />
                {wakeWordListening && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                )}
              </span>
              <span className="flex-1 text-left text-sm">
                &quot;Hey Jarvis&quot;
              </span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                  wakeWordEnabled
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {wakeWordEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setGuideMode(!guideMode)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              guideMode
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span className="relative flex size-4 items-center justify-center">
              <GlobeSimple size={14} />
            </span>
            <span className="flex-1 text-left text-sm">
              Guide Mode
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                guideMode
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {guideMode ? 'ON' : 'OFF'}
            </span>
          </button>
          {onOpenA2eStudio && (
            <Button variant="ghost" size="sm" onClick={onOpenA2eStudio} className="w-full justify-start gap-2 px-2">
              <FilmSlate size={16} />
              <span className="text-sm">A2E Studio</span>
            </Button>
          )}
          {onOpenWebBrowser && (
            <Button variant="ghost" size="sm" onClick={onOpenWebBrowser} className="w-full justify-start gap-2 px-2">
              <GlobeSimple size={16} />
              <span className="text-sm">Web Browser</span>
            </Button>
          )}
          {onOpenAgentBrowser && (
            <Button variant="ghost" size="sm" onClick={onOpenAgentBrowser} className="w-full justify-start gap-2 px-2">
              <Robot size={16} />
              <span className="text-sm">Agent Browser</span>
            </Button>
          )}
          {onOpenMediaCanvas && (
            <Button variant="ghost" size="sm" onClick={onOpenMediaCanvas} className="w-full justify-start gap-2 px-2">
              <PaintBrush size={16} />
              <span className="text-sm">Media Canvas</span>
            </Button>
          )}
          {onOpenCodeEditor && (
            <Button variant="ghost" size="sm" onClick={onOpenCodeEditor} className="w-full justify-start gap-2 px-2">
              <Code size={16} />
              <span className="text-sm">Code Editor</span>
            </Button>
          )}
          {onOpenMusicPlayer && (
            <Button variant="ghost" size="sm" onClick={onOpenMusicPlayer} className="w-full justify-start gap-2 px-2">
              <MusicNotes size={16} />
              <span className="text-sm">Music Player</span>
            </Button>
          )}
        </div>
      )}

      <div className="p-3 border-t border-border">
        <Button
          variant="ghost"
          size={isCollapsed ? 'icon' : 'sm'}
          onClick={onOpenSettings}
          className={cn('gap-2', isCollapsed ? 'w-10 h-10' : 'w-full justify-start')}
        >
          <Gear size={20} />
          {!isCollapsed && <span>Settings</span>}
        </Button>
      </div>
    </div>
  )
}
