import { useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Button } from '@/components/ui/button'
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
  Gear
} from '@phosphor-icons/react'
import { Thread, Workspace } from '@/lib/types'
import { formatTimestamp } from '@/lib/helpers'
import { cn } from '@/lib/utils'

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
}: AppSidebarProps) {
  const [threads] = useLocalStorage<Thread[]>('threads', [])
  const [workspaces] = useLocalStorage<Workspace[]>('workspaces', [])
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [workspacesOpen, setWorkspacesOpen] = useState(true)

  const sortedThreads = [...(threads || [])].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-3 flex items-center justify-between border-b border-border">
        {!isCollapsed && (
          <h1 className="text-lg font-semibold tracking-tight">Nexus</h1>
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
                {sortedThreads.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-4">No threads yet</p>
                ) : (
                  sortedThreads.map((thread) => (
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
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(thread.updatedAt)}
                        </p>
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
