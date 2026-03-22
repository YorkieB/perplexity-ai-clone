import { UploadedFile } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, DownloadSimple, FileText } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatFileSize } from '@/lib/helpers'

interface FilePreviewModalProps {
  file: UploadedFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FilePreviewModal({ file, open, onOpenChange }: FilePreviewModalProps) {
  if (!file) return null

  const isImage = file.type.startsWith('image/')
  const isText = file.type.startsWith('text/')
  const isPDF = file.type === 'application/pdf'

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = file.content
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderPreviewContent = () => {
    if (isImage) {
      return (
        <div className="flex items-center justify-center bg-muted/30 rounded-lg p-6 min-h-[400px]">
          <img
            src={file.content}
            alt={file.name}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />
        </div>
      )
    }

    if (isText) {
      const textContent = file.content.startsWith('data:')
        ? atob(file.content.split(',')[1])
        : file.content

      return (
        <div className="bg-muted/30 rounded-lg p-6 min-h-[400px]">
          <ScrollArea className="h-[60vh]">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground">
              {textContent}
            </pre>
          </ScrollArea>
        </div>
      )
    }

    if (isPDF) {
      return (
        <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg p-12 min-h-[400px] gap-4">
          <FileText size={64} className="text-muted-foreground" />
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              PDF preview is not available in browser
            </p>
            <Button onClick={handleDownload} variant="outline" size="sm">
              <DownloadSimple size={16} className="mr-2" />
              Download to view
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg p-12 min-h-[400px] gap-4">
        <FileText size={64} className="text-muted-foreground" />
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
          <Button onClick={handleDownload} variant="outline" size="sm">
            <DownloadSimple size={16} className="mr-2" />
            Download file
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold truncate">{file.name}</DialogTitle>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>{formatFileSize(file.size)}</span>
                <span>•</span>
                <span className="truncate">{file.type}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="shrink-0"
            >
              <X size={20} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 pb-6 pt-4">{renderPreviewContent()}</div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownload}>
            <DownloadSimple size={16} className="mr-2" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
