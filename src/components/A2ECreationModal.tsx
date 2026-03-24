import type { A2ETask } from '@/lib/types'
import { A2E_MODELS } from '@/lib/a2e-api'
import { downloadFilename, downloadMediaUrl } from '@/lib/a2e-download'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy } from '@phosphor-icons/react'
import { Download, ExternalLink } from 'lucide-react'

function modelLabel(modelId: string): string {
  return A2E_MODELS.find((m) => m.id === modelId)?.name ?? modelId
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {})
}

interface A2ECreationModalProps {
  task: A2ETask | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function A2ECreationModal({ task, open, onOpenChange }: A2ECreationModalProps) {
  if (!task) return null

  const title = modelLabel(task.modelId)
  const hasMedia =
    task.status === 'completed' &&
    task.mediaType !== 'info' &&
    task.resultUrls.some(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <p className="text-muted-foreground text-sm font-normal">
            {task.status === 'completed' ? 'Your creation is ready.' : 'Something went wrong.'}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {task.status === 'failed' && task.error && (
            <p className="text-destructive text-sm">{task.error}</p>
          )}

          {task.status === 'completed' && task.mediaType === 'info' && task.detail && (
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">{task.detail}</p>
          )}

          {task.status === 'completed' && task.mediaType === 'image' && hasMedia && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {task.resultUrls.filter(Boolean).map((url, idx) => (
                  <div
                    key={url}
                    className="group relative overflow-hidden rounded-xl border border-border bg-muted/30"
                  >
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={url} alt="" className="max-h-[min(60vh,520px)] w-full object-contain" />
                    </a>
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 px-2 text-xs shadow-md"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void downloadMediaUrl(url, downloadFilename(task, url, idx))
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Save
                      </Button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-background/90 px-2 text-xs shadow-md"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.status === 'completed' && task.mediaType === 'video' && hasMedia && (
            <div className="space-y-3">
              {task.resultUrls.filter(Boolean).map((url, idx) => (
                <div key={url} className="space-y-2">
                  <video
                    src={url}
                    controls
                    playsInline
                    className="w-full max-h-[min(70vh,560px)] rounded-xl border border-border bg-black"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void downloadMediaUrl(url, downloadFilename(task, url, idx))}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download video
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {task.status === 'completed' && task.mediaType === 'audio' && hasMedia && (
            <div className="space-y-3">
              {task.resultUrls.filter(Boolean).map((url, idx) => (
                <div key={url} className="space-y-2">
                  <audio src={url} controls className="w-full" />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void downloadMediaUrl(url, downloadFilename(task, url, idx))}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download audio
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          {task.resultUrls.filter(Boolean).map((url, idx) => (
            <div key={url} className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => copyText(url)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy URL
              </Button>
              {hasMedia && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void downloadMediaUrl(url, downloadFilename(task, url, idx))}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              )}
            </div>
          ))}
          {task.resultUrls[0] && (
            <Button type="button" size="sm" className="gap-1.5" asChild>
              <a href={task.resultUrls[0]} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open first result
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
