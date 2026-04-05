import { useEffect, useState } from 'react'
import { Thread, Workspace, WorkspaceFile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Card } from '@/components/ui/card'
import {
  FileTextIcon as FileText,
  FolderIcon as Folder,
  LinkSimpleIcon as LinkSimple,
} from '@phosphor-icons/react'
import { CalendarClock, FileStack, PencilLine, Table2 } from 'lucide-react'
import {
  WorkspaceFilesModal,
  type WorkspaceFileRow,
} from '@/components/WorkspaceFilesModal'
import { cn } from '@/lib/utils'

const DESC_MAX = 1000

function threadPreview(thread: Thread): string {
  if (thread.messages.length === 0) return 'No messages yet'
  const last = thread.messages[thread.messages.length - 1]
  const raw = last?.content ?? ''
  let plain = raw
  for (const token of ['#', '*', '`', '_', '[', ']', '(', ')']) {
    plain = plain.replaceAll(token, ' ')
  }
  plain = plain.replaceAll(/\s+/g, ' ').trim()
  const slice = plain.slice(0, 140)
  return slice.length < plain.length ? `${slice}…` : slice || '…'
}

function formatThreadDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface WorkspaceHomeViewProps {
  workspace: Workspace
  threads: Thread[]
  queryInput: React.ReactNode
  onUpdateWorkspace: (partial: Partial<Pick<Workspace, 'name' | 'description' | 'customSystemPrompt'>>) => void
  onOpenThread: (threadId: string) => void
  onEditWorkspace: () => void
}

function toWorkspaceFileRows(files: readonly WorkspaceFile[] | undefined): WorkspaceFileRow[] {
  return (files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    origin: 'Upload',
    date: file.uploadedAt ?? file.addedAt ?? Date.now(),
    status: 'Ready',
  }))
}

export function WorkspaceHomeView({
  workspace,
  threads,
  queryInput,
  onUpdateWorkspace,
  onOpenThread,
  onEditWorkspace,
}: Readonly<WorkspaceHomeViewProps>) {
  const [description, setDescription] = useState(workspace.description)
  const [filesModalOpen, setFilesModalOpen] = useState(false)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileRow[]>(() => toWorkspaceFileRows(workspace.workspaceFiles))

  useEffect(() => {
    setDescription(workspace.description)
  }, [workspace.id, workspace.description])

  useEffect(() => {
    setWorkspaceFiles(toWorkspaceFileRows(workspace.workspaceFiles))
  }, [workspace.id, workspace.workspaceFiles])

  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <>
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="h-full min-h-0">
          <div className="mx-auto w-full max-w-3xl px-6 pb-8 pt-10">
            <header className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <Folder size={22} className="text-accent" weight="duotone" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{workspace.name}</h1>
                    <p className="text-xs text-muted-foreground">Workspace</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ws-desc" className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <Textarea
                  id="ws-desc"
                  placeholder="What this workspace is for and how to use it"
                  value={description}
                  maxLength={DESC_MAX}
                  rows={3}
                  className={cn(
                    'min-h-[5rem] resize-y text-sm',
                    'border-0 border-transparent bg-transparent px-0 py-1 shadow-none',
                    'ring-0 ring-offset-0',
                    'focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0'
                  )}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                  onBlur={() => {
                    const next = description.trim()
                    if (next !== (workspace.description || '').trim()) {
                      onUpdateWorkspace({ description: next })
                    }
                  }}
                />
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  {description.length}/{DESC_MAX}
                </p>
              </div>
            </header>

            <div className="mt-8 space-y-3">{queryInput}</div>

            <Separator className="my-10" />

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText size={18} className="text-muted-foreground" />
                My threads
              </div>
              {sorted.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No threads yet. Ask a question above to start.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sorted.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpenThread(t.id)}
                        className={cn(
                          'w-full rounded-xl border border-border bg-card/50 px-4 py-3 text-left transition-colors',
                          'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        )}
                      >
                        <p className="line-clamp-1 font-medium">{t.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{threadPreview(t)}</p>
                        <p className="mt-2 text-xs text-muted-foreground/80">{formatThreadDate(t.updatedAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </div>

      <aside
        className="hidden w-[min(20rem,28vw)] shrink-0 border-l border-border bg-muted/10 lg:flex lg:flex-col"
        aria-label="Workspace context"
      >
        <ScrollArea className="h-full min-h-0">
          <div className="p-3">
            <Card className="gap-0 overflow-hidden py-0 shadow-sm">
              <section className="border-b border-border px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileStack className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      Files
                    </div>
                    <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                      Files to use as context for searches
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setFilesModalOpen(true)}
                    aria-label="Open files"
                    title="Open files"
                  >
                    <Table2 className="size-4" />
                  </Button>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full text-center text-xs text-muted-foreground/90 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  onClick={() => setFilesModalOpen(true)}
                >
                  View all {workspaceFiles.length} files
                </button>
              </section>

              <section className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    <LinkSimple size={16} className="shrink-0 text-muted-foreground" />
                    Links
                  </span>
                  <span className="shrink-0 text-muted-foreground" aria-hidden>
                    ›
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  Websites to include in every search
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full text-xs font-normal"
                  disabled
                  title="Coming soon"
                >
                  + Add links
                </Button>
              </section>

              <section className="space-y-2 px-4 py-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-full justify-start gap-2 text-xs font-normal"
                  onClick={onEditWorkspace}
                >
                  <PencilLine className="size-3.5 shrink-0" />
                  Edit custom instructions
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-start gap-2 text-xs font-normal"
                  disabled
                  title="Coming soon"
                >
                  <CalendarClock className="size-3.5 shrink-0" />
                  Scheduled tasks
                </Button>
              </section>
            </Card>
          </div>
        </ScrollArea>
      </aside>
    </div>
    <WorkspaceFilesModal
      open={filesModalOpen}
      onOpenChange={setFilesModalOpen}
      files={workspaceFiles}
      onRemoveFile={(id) => setWorkspaceFiles((f) => f.filter((x) => x.id !== id))}
    />
    </>
  )
}
