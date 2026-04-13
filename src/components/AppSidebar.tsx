import { useState, type ReactNode } from 'react'
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
  PaintBrush,
  Code,
  MusicNotes,
  ChartLine,
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
  onWorkspaceSelect: (workspaceId: string | null) => void
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
  /** When true, Jarvis Reasoning Dashboard is shown in the main column. */
  reasoningDashboardActive?: boolean
  /** Open the reasoning dashboard in the main app area (same “tab” as chat). */
  onOpenReasoningDashboard?: () => void
}

function SidebarThreadRow({
  thread,
  activeThreadId,
  activeWorkspaceId,
  workspaceNames,
  onThreadSelect,
}: {
  thread: Thread
  activeThreadId: string | null
  activeWorkspaceId: string | null
  workspaceNames: Map<string, string>
  onThreadSelect: (id: string) => void
}) {
  const workspaceLabel =
    activeWorkspaceId === null && thread.workspaceId !== undefined && thread.workspaceId !== ''
      ? workspaceNames.get(thread.workspaceId)
      : undefined

  return (
    <Button
      variant={activeThreadId === thread.id ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => onThreadSelect(thread.id)}
      className={cn(
        'w-full justify-start gap-2 h-auto py-2 px-2',
        activeThreadId === thread.id && 'border-r-2 border-accent rounded-r-none',
      )}
    >
      <ChatCircle size={16} className="shrink-0" />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm truncate">{thread.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{formatTimestamp(thread.updatedAt)}</p>
          {workspaceLabel !== undefined && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {workspaceLabel}
            </Badge>
          )}
        </div>
      </div>
    </Button>
  )
}

function SidebarLibrarySection({
  libraryOpen,
  setLibraryOpen,
  onNewThread,
  activeWorkspace,
  visibleThreads,
  groupedThreads,
  activeThreadId,
  activeWorkspaceId,
  workspaceNames,
  onThreadSelect,
  onClearWorkspaceFilter,
}: {
  libraryOpen: boolean
  setLibraryOpen: (open: boolean) => void
  onNewThread: () => void
  activeWorkspace: Workspace | undefined
  visibleThreads: Thread[]
  groupedThreads: Array<{ id: string; label: string; threads: Thread[] }>
  activeThreadId: string | null
  activeWorkspaceId: string | null
  workspaceNames: Map<string, string>
  onThreadSelect: (id: string) => void
  onClearWorkspaceFilter: () => void
}) {
  const emptyLabel = activeWorkspace !== undefined ? 'No threads in this workspace yet' : 'No threads yet'
  const hasVisibleThreads = visibleThreads.length > 0

  let threadListContent: ReactNode
  if (!hasVisibleThreads) {
    threadListContent = <p className="text-xs text-muted-foreground px-2 py-4">{emptyLabel}</p>
  } else if (activeWorkspace !== undefined) {
    threadListContent = visibleThreads.map((thread) => (
      <SidebarThreadRow
        key={thread.id}
        thread={thread}
        activeThreadId={activeThreadId}
        activeWorkspaceId={activeWorkspaceId}
        workspaceNames={workspaceNames}
        onThreadSelect={onThreadSelect}
      />
    ))
  } else {
    threadListContent = groupedThreads.map((group) => (
      <div key={group.id} className="space-y-1">
        <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {group.label}
        </p>
        {group.threads.map((thread) => (
          <SidebarThreadRow
            key={thread.id}
            thread={thread}
            activeThreadId={activeThreadId}
            activeWorkspaceId={activeWorkspaceId}
            workspaceNames={workspaceNames}
            onThreadSelect={onThreadSelect}
          />
        ))}
      </div>
    ))
  }

  return (
    <Collapsible open={libraryOpen} onOpenChange={setLibraryOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 w-full justify-start px-2">
            {libraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
            <span className="text-sm font-medium">Library</span>
          </Button>
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon" onClick={onNewThread} className="h-7 w-7">
          <Plus size={16} />
        </Button>
      </div>
      <CollapsibleContent className="mt-2 space-y-1">
        {activeWorkspace !== undefined && (
          <div className="flex items-center justify-between gap-2 px-2 pb-1">
            <p className="text-xs text-muted-foreground">
              Showing threads in <span className="font-medium text-foreground">{activeWorkspace.name}</span>
            </p>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearWorkspaceFilter}>
              Show all
            </Button>
          </div>
        )}
        {threadListContent}
      </CollapsibleContent>
    </Collapsible>
  )
}

function SidebarWorkspacesSection({
  workspacesOpen,
  setWorkspacesOpen,
  onNewWorkspace,
  workspaces,
  activeWorkspaceId,
  onWorkspaceSelect,
}: {
  workspacesOpen: boolean
  setWorkspacesOpen: (open: boolean) => void
  onNewWorkspace: () => void
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onWorkspaceSelect: (id: string | null) => void
}) {
  const list = workspaces ?? []

  return (
    <Collapsible open={workspacesOpen} onOpenChange={setWorkspacesOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 w-full justify-start px-2">
            {workspacesOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
            <span className="text-sm font-medium">Workspaces</span>
          </Button>
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon" onClick={onNewWorkspace} className="h-7 w-7">
          <Plus size={16} />
        </Button>
      </div>
      <CollapsibleContent className="mt-2 space-y-1">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-4">No workspaces yet</p>
        ) : (
          list.map((workspace) => (
            <Button
              key={workspace.id}
              variant={activeWorkspaceId === workspace.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onWorkspaceSelect(workspace.id)}
              className={cn(
                'w-full justify-start gap-2 h-auto py-2 px-2',
                activeWorkspaceId === workspace.id && 'border-l-2 border-accent rounded-l-none',
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
  )
}

function SidebarCollapsedRail({ onNewThread, onNewWorkspace }: { onNewThread: () => void; onNewWorkspace: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-4 py-4">
      <Button variant="ghost" size="icon" onClick={onNewThread} className="h-10 w-10">
        <ChatCircle size={20} />
      </Button>
      <Separator />
      <Button variant="ghost" size="icon" onClick={onNewWorkspace} className="h-10 w-10">
        <Folder size={20} />
      </Button>
    </div>
  )
}

function ToggleRow({
  active,
  onClick,
  icon,
  label,
  activeClass,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  activeClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'text-foreground hover:bg-muted'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="relative flex size-4 items-center justify-center">{icon}</span>
      <span className="flex-1 text-left text-sm">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
          active ? activeClass : 'bg-muted text-muted-foreground',
        )}
      >
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

function SidebarToolsSection({
  onOpenVoice,
  onWakeWordToggle,
  wakeWordEnabled,
  wakeWordListening,
  guideMode,
  setGuideMode,
  onOpenA2eStudio,
  onOpenWebBrowser,
  onOpenAgentBrowser,
  onOpenMediaCanvas,
  onOpenCodeEditor,
  onOpenMusicPlayer,
}: {
  onOpenVoice?: () => void
  onWakeWordToggle?: (enabled: boolean) => void
  wakeWordEnabled?: boolean
  wakeWordListening?: boolean
  guideMode: boolean
  setGuideMode: (v: boolean) => void
  onOpenA2eStudio?: () => void
  onOpenWebBrowser?: () => void
  onOpenAgentBrowser?: () => void
  onOpenMediaCanvas?: () => void
  onOpenCodeEditor?: () => void
  onOpenMusicPlayer?: () => void
}) {
  return (
    <div className="px-3 pb-2 space-y-1">
      <Separator className="mb-2" />
      <p className="text-xs text-muted-foreground px-2 pb-1 font-medium">Tools</p>
      {onOpenVoice !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenVoice} className="w-full justify-start gap-2 px-2">
          <Microphone size={16} />
          <span className="text-sm">Voice Mode</span>
        </Button>
      )}
      {onWakeWordToggle !== undefined && (
        <button
          type="button"
          onClick={() => onWakeWordToggle(!wakeWordEnabled)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            wakeWordEnabled
              ? 'text-foreground hover:bg-muted'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span className="relative flex size-4 items-center justify-center">
            <Microphone size={14} />
            {wakeWordListening === true && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
            )}
          </span>
          <span className="flex-1 text-left text-sm">&quot;Hey Jarvis&quot;</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
              wakeWordEnabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {wakeWordEnabled === true ? 'ON' : 'OFF'}
          </span>
        </button>
      )}
      <ToggleRow
        active={guideMode}
        onClick={() => setGuideMode(!guideMode)}
        icon={<GlobeSimple size={14} />}
        label="Guide Mode"
        activeClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
      />
      {onOpenA2eStudio !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenA2eStudio} className="w-full justify-start gap-2 px-2">
          <FilmSlate size={16} />
          <span className="text-sm">A2E Studio</span>
        </Button>
      )}
      {onOpenWebBrowser !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenWebBrowser} className="w-full justify-start gap-2 px-2">
          <GlobeSimple size={16} />
          <span className="text-sm">Web Browser</span>
        </Button>
      )}
      {onOpenAgentBrowser !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenAgentBrowser} className="w-full justify-start gap-2 px-2">
          <Robot size={16} />
          <span className="text-sm">Agent Browser</span>
        </Button>
      )}
      {onOpenMediaCanvas !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenMediaCanvas} className="w-full justify-start gap-2 px-2">
          <PaintBrush size={16} />
          <span className="text-sm">Media Canvas</span>
        </Button>
      )}
      {onOpenCodeEditor !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenCodeEditor} className="w-full justify-start gap-2 px-2">
          <Code size={16} />
          <span className="text-sm">Code Editor</span>
        </Button>
      )}
      {onOpenMusicPlayer !== undefined && (
        <Button variant="ghost" size="sm" onClick={onOpenMusicPlayer} className="w-full justify-start gap-2 px-2">
          <MusicNotes size={16} />
          <span className="text-sm">Music Player</span>
        </Button>
      )}
    </div>
  )
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
  onDeleteThread: _onDeleteThread,
  onDeleteWorkspace: _onDeleteWorkspace,
  onOpenA2eStudio,
  onOpenWebBrowser,
  onOpenAgentBrowser,
  onOpenMediaCanvas,
  onOpenCodeEditor,
  onOpenMusicPlayer,
  onOpenVoice,
  wakeWordEnabled,
  wakeWordSupported: _wakeWordSupported,
  wakeWordListening,
  onWakeWordToggle,
  reasoningDashboardActive = false,
  onOpenReasoningDashboard,
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
  const visibleThreads = activeWorkspaceId ? sortedThreads.filter((thread) => thread.workspaceId === activeWorkspaceId) : sortedThreads
  const workspaceNames = new Map((workspaces || []).map((workspace) => [workspace.id, workspace.name]))
  const groupedThreads = (workspaces || [])
    .map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      threads: sortedThreads.filter((thread) => thread.workspaceId === workspace.id),
    }))
    .filter((group) => group.threads.length > 0)
  const noWorkspaceThreads = sortedThreads.filter((thread) => !thread.workspaceId || !workspaceNames.has(thread.workspaceId))
  if (noWorkspaceThreads.length > 0) {
    groupedThreads.push({
      id: 'no-workspace',
      label: 'No workspace',
      threads: noWorkspaceThreads,
    })
  }

  return (
    <div
      className={cn(
        'h-screen flex-shrink-0 bg-card border-l border-border flex flex-col transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="p-3 flex items-center justify-between border-b border-border">
        {!isCollapsed && <h1 className="text-lg font-semibold tracking-tight">AI Search</h1>}
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <List size={20} />
        </Button>
      </div>

      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            <SidebarLibrarySection
              libraryOpen={libraryOpen}
              setLibraryOpen={setLibraryOpen}
              onNewThread={onNewThread}
              activeWorkspace={activeWorkspace}
              visibleThreads={visibleThreads}
              groupedThreads={groupedThreads}
              activeThreadId={activeThreadId}
              activeWorkspaceId={activeWorkspaceId}
              workspaceNames={workspaceNames}
              onThreadSelect={onThreadSelect}
              onClearWorkspaceFilter={() => onWorkspaceSelect(null)}
            />
            <Separator />
            <SidebarWorkspacesSection
              workspacesOpen={workspacesOpen}
              setWorkspacesOpen={setWorkspacesOpen}
              onNewWorkspace={onNewWorkspace}
              workspaces={workspaces ?? []}
              activeWorkspaceId={activeWorkspaceId}
              onWorkspaceSelect={onWorkspaceSelect}
            />
          </div>
        </ScrollArea>
      )}

      {isCollapsed && <SidebarCollapsedRail onNewThread={onNewThread} onNewWorkspace={onNewWorkspace} />}

      {!isCollapsed && (
        <SidebarToolsSection
          onOpenVoice={onOpenVoice}
          onWakeWordToggle={onWakeWordToggle}
          wakeWordEnabled={wakeWordEnabled}
          wakeWordListening={wakeWordListening}
          guideMode={guideMode}
          setGuideMode={setGuideMode}
          onOpenA2eStudio={onOpenA2eStudio}
          onOpenWebBrowser={onOpenWebBrowser}
          onOpenAgentBrowser={onOpenAgentBrowser}
          onOpenMediaCanvas={onOpenMediaCanvas}
          onOpenCodeEditor={onOpenCodeEditor}
          onOpenMusicPlayer={onOpenMusicPlayer}
        />
      )}

      <div className="space-y-1 border-t border-border p-3">
        <Button
          type="button"
          variant={reasoningDashboardActive ? 'secondary' : 'ghost'}
          size={isCollapsed ? 'icon' : 'sm'}
          className={cn('gap-2', isCollapsed ? 'h-10 w-10' : 'w-full justify-start')}
          title="Jarvis Reasoning Dashboard"
          onClick={() => {
            onOpenReasoningDashboard?.()
          }}
        >
          <ChartLine size={20} />
          {!isCollapsed && <span className="text-sm">Reasoning</span>}
        </Button>
        <Button
          variant="ghost"
          size={isCollapsed ? 'icon' : 'sm'}
          onClick={onOpenSettings}
          className={cn('gap-2', isCollapsed ? 'h-10 w-10' : 'w-full justify-start')}
        >
          <Gear size={20} />
          {!isCollapsed && <span>Settings</span>}
        </Button>
      </div>
    </div>
  )
}
