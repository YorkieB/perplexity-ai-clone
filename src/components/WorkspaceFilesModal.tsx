import { useCallback, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileIcon,
  ImageIcon,
  MoreHorizontal,
  Search,
} from 'lucide-react'

import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type WorkspaceFilePreview =
  | { kind: 'markdown'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'unsupported'; message: string }

export interface WorkspaceFileRow {
  readonly id: string
  readonly name: string
  readonly origin: 'Upload' | 'Google Drive' | 'OneDrive' | 'GitHub'
  readonly date: number
  readonly status: 'Ready' | 'Pending' | 'Error'
  /** When omitted, a preview is inferred from the file name. */
  readonly preview?: WorkspaceFilePreview
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function resolveWorkspaceFilePreview(row: WorkspaceFileRow): WorkspaceFilePreview {
  if (row.preview) return row.preview
  const ext = fileExtension(row.name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return {
      kind: 'image',
      src: `https://picsum.photos/seed/${encodeURIComponent(row.id)}/960/540`,
      alt: row.name,
    }
  }
  if (ext === 'pdf') {
    return {
      kind: 'unsupported',
      message:
        'PDF preview is not available in the app yet. Download the file from your connector to open it.',
    }
  }
  return {
    kind: 'text',
    content: `No preview content is stored for "${row.name}". Connect a source or upload a file to see it here.`,
  }
}

/** Demo rows so the modal matches the design before real persistence exists. */
export const WORKSPACE_FILES_DEMO: WorkspaceFileRow[] = [
  {
    id: '1',
    name: 'Web Audio API for Real-Time AI Processing.md',
    origin: 'Upload',
    date: new Date('2026-01-09T21:40:00').getTime(),
    status: 'Ready',
    preview: {
      kind: 'markdown',
      content: `# Web Audio API for real-time AI

This note summarizes how the **Web Audio API** can drive low-latency pipelines.

## Diagram

![Example signal path](https://picsum.photos/seed/webaudio/720/280)

- Capture mic or synthesized buffers with \`AudioContext\`
- Process via \`AudioWorklet\` for predictable timing
- Visualize levels without blocking the audio thread`,
    },
  },
  {
    id: '2',
    name: 'VoiceToggleButton.txt',
    origin: 'Upload',
    date: new Date('2026-01-08T14:22:00').getTime(),
    status: 'Ready',
    preview: {
      kind: 'text',
      content:
        'VoiceToggleButton\n- toggles mic capture\n- debounced 150ms\n- emits voice:state-changed events for the host UI',
    },
  },
  {
    id: '3',
    name: 'voicechat_diagnostic_explainer.md',
    origin: 'Upload',
    date: new Date('2026-01-07T10:15:00').getTime(),
    status: 'Ready',
    preview: {
      kind: 'markdown',
      content:
        '## Diagnostics\n\nRun with `VITE_DEBUG_VOICE=1` and capture **console + network** when reporting issues.',
    },
  },
  {
    id: '4',
    name: 'waveform_screenshot.png',
    origin: 'Upload',
    date: new Date('2026-01-06T18:30:00').getTime(),
    status: 'Ready',
    preview: {
      kind: 'image',
      src: 'https://picsum.photos/seed/waveformshot/960/540',
      alt: 'Waveform screenshot',
    },
  },
  {
    id: '5',
    name: 'Voice Synthesis Evaluation Notes.pdf',
    origin: 'Upload',
    date: new Date('2026-01-05T09:00:00').getTime(),
    status: 'Ready',
    preview: {
      kind: 'unsupported',
      message:
        'PDF preview is not available in the browser yet. Use Download from your cloud connector when that flow is connected.',
    },
  },
]

const PAGE_SIZE = 5

function formatTableDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function NameIcon({ name }: { readonly name: string }) {
  const ext = fileExtension(name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  }
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
}

function WorkspaceFilePreviewBody({ preview }: { readonly preview: WorkspaceFilePreview }) {
  const noopHover = useCallback(() => {}, [])

  switch (preview.kind) {
    case 'markdown':
      return (
        <div className="min-w-0 px-1">
          <MarkdownRenderer content={preview.content} onCitationHover={noopHover} />
        </div>
      )
    case 'text':
      return (
        <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-foreground">
          {preview.content}
        </pre>
      )
    case 'image':
      return (
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full justify-center rounded-lg border border-border bg-muted/20 p-3">
            <img
              src={preview.src}
              alt={preview.alt ?? 'File preview'}
              className="max-h-[min(70vh,560px)] w-auto max-w-full object-contain"
              loading="lazy"
            />
          </div>
          {preview.alt ? <p className="text-center text-xs text-muted-foreground">{preview.alt}</p> : null}
        </div>
      )
    case 'unsupported':
      return (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          {preview.message}
        </p>
      )
    default:
      return null
  }
}

interface WorkspaceFilePreviewDialogProps {
  readonly row: WorkspaceFileRow | null
  readonly onOpenChange: (open: boolean) => void
}

function WorkspaceFilePreviewDialog({ row, onOpenChange }: WorkspaceFilePreviewDialogProps) {
  const open = row !== null
  const preview = row ? resolveWorkspaceFilePreview(row) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[100]"
        className={cn(
          'z-[101] flex max-h-[min(88vh,900px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'
        )}
      >
        {row && preview ? (
          <>
            <DialogHeader className="border-b border-border px-6 py-4 text-left sm:pr-14">
              <DialogTitle className="line-clamp-2 pr-2 text-lg font-semibold leading-snug">
                {row.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Preview · {preview.kind === 'image' ? 'Image' : preview.kind === 'markdown' ? 'Markdown' : preview.kind === 'text' ? 'Text' : 'Unavailable'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[min(72vh,760px)] px-6 py-4">
              <WorkspaceFilePreviewBody preview={preview} />
            </ScrollArea>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface WorkspaceFilesModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** When empty, demo rows are shown so the UI is previewable. */
  readonly files?: WorkspaceFileRow[]
  /** When set, called after remove; parent should update `files`. If omitted, removals are tracked only inside the modal. */
  readonly onRemoveFile?: (fileId: string) => void
}

export function WorkspaceFilesModal({ open, onOpenChange, files, onRemoveFile }: WorkspaceFilesModalProps) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  const baseRows = files ?? WORKSPACE_FILES_DEMO
  const rows = useMemo(() => {
    if (onRemoveFile) return baseRows
    return baseRows.filter((r) => !removedIds.has(r.id))
  }, [baseRows, onRemoveFile, removedIds])

  const [query, setQuery] = useState('')
  const [connector, setConnector] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [previewRow, setPreviewRow] = useState<WorkspaceFileRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false
      if (connector !== 'all' && r.origin !== connector) return false
      if (status !== 'all' && r.status !== status) return false
      return true
    })
  }, [rows, query, connector, status])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const openPreview = useCallback((row: WorkspaceFileRow) => {
    setPreviewRow(row)
  }, [])

  const removeFile = useCallback(
    (row: WorkspaceFileRow) => {
      if (previewRow?.id === row.id) {
        setPreviewRow(null)
      }
      if (onRemoveFile) {
        onRemoveFile(row.id)
      } else {
        setRemovedIds((prev) => new Set(prev).add(row.id))
      }
    },
    [onRemoveFile, previewRow?.id]
  )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          if (!next) {
            setQuery('')
            setConnector('all')
            setStatus('all')
            setPage(0)
            setPreviewRow(null)
            if (!onRemoveFile) {
              setRemovedIds(new Set())
            }
          }
        }}
      >
        <DialogContent
          className={cn(
            'flex max-h-[min(85vh,900px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]'
          )}
        >
          <DialogHeader className="border-b border-border px-6 py-4 text-left sm:pr-14">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              Files
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  placeholder="Filter by name..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setPage(0)
                  }}
                  className="h-9 pl-9"
                  aria-label="Filter files by name"
                />
              </div>
              <Select
                value={connector}
                onValueChange={(v) => {
                  setConnector(v)
                  setPage(0)
                }}
              >
                <SelectTrigger size="sm" className="h-9 w-[min(100%,10rem)]">
                  <SelectValue placeholder="Connector" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All connectors</SelectItem>
                  <SelectItem value="Upload">Upload</SelectItem>
                  <SelectItem value="Google Drive">Google Drive</SelectItem>
                  <SelectItem value="OneDrive">OneDrive</SelectItem>
                  <SelectItem value="GitHub">GitHub</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  setPage(0)
                }}
              >
                <SelectTrigger size="sm" className="h-9 w-[min(100%,9rem)]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto h-9 gap-1 bg-foreground text-background hover:bg-foreground/90"
                  >
                    + Add files
                    <ChevronDown className="size-4 opacity-80" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled>Upload from device</DropdownMenuItem>
                  <DropdownMenuItem disabled>Sync from Google Drive</DropdownMenuItem>
                  <DropdownMenuItem disabled>Paste text as file</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[38%] pl-4 text-xs font-medium text-muted-foreground">
                      Name
                    </TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Origin</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Date</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="w-10 pr-4 text-right text-xs font-medium text-muted-foreground">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                        No files match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    slice.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-0 pl-4 font-medium">
                          <button
                            type="button"
                            onClick={() => openPreview(row)}
                            className="flex min-w-0 max-w-full items-center gap-2 text-left text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          >
                            <NameIcon name={row.name} />
                            <span className="truncate">{row.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.origin}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatTableDate(row.date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.status}</TableCell>
                        <TableCell className="pr-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Actions for ${row.name}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-[110]">
                              <DropdownMenuItem onSelect={() => openPreview(row)}>Open</DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => removeFile(row)}
                              >
                                Remove from workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-end gap-4 pb-4 text-sm text-muted-foreground">
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                  safePage <= 0 && 'pointer-events-none opacity-40'
                )}
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Prev
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                  safePage >= pageCount - 1 && 'pointer-events-none opacity-40'
                )}
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkspaceFilePreviewDialog row={previewRow} onOpenChange={(o) => !o && setPreviewRow(null)} />
    </>
  )
}
