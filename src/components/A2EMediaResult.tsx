import type { A2ETask } from '@/lib/types'
import { downloadFilename, downloadMediaUrl } from '@/lib/a2e-download'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Download, ExternalLink } from 'lucide-react'

interface A2EMediaResultProps {
  task: A2ETask
  className?: string
}

export function A2EMediaResult({ task, className }: A2EMediaResultProps) {
  if (task.status === 'failed') {
    return (
      <div className={cn('rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm', className)}>
        <p className="font-medium text-destructive">A2E generation failed</p>
        {task.error && <p className="text-muted-foreground mt-1">{task.error}</p>}
      </div>
    )
  }

  if (task.mediaType === 'info') {
    return (
      <div className={cn('rounded-lg border border-border bg-card/50 px-3 py-2 text-sm space-y-1', className)}>
        {task.detail && <p className="text-muted-foreground whitespace-pre-wrap">{task.detail}</p>}
        {task.resultUrls.length === 0 && !task.detail && (
          <p className="text-muted-foreground">See message text for details.</p>
        )}
      </div>
    )
  }

  if (task.mediaType === 'image' && task.resultUrls.length > 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">A2E output</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {task.resultUrls.map((url, idx) => (
            <div
              key={url}
              className="group relative shrink-0 overflow-hidden rounded-lg border border-border max-h-64"
            >
              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt="" className="max-h-64 w-auto object-contain" loading="lazy" />
              </a>
              <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1 px-2 text-xs shadow-md"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void downloadMediaUrl(url, downloadFilename(task, url, idx))
                  }}
                >
                  <Download className="h-3 w-3" />
                  Save
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-xs shadow-md"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (task.mediaType === 'video' && task.resultUrls.length > 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">A2E video</p>
        {task.resultUrls.map((url, idx) => (
          <div key={url} className="space-y-2">
            <video
              src={url}
              controls
              className="w-full max-w-2xl rounded-lg border border-border bg-black"
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
    )
  }

  if (task.mediaType === 'audio' && task.resultUrls.length > 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">A2E audio</p>
        {task.resultUrls.map((url, idx) => (
          <div key={url} className="space-y-2">
            <audio src={url} controls className="w-full max-w-xl" />
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
    )
  }

  return null
}
