import { UploadedFile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { X, DownloadSimple, FileText } from '@phosphor-icons/react'
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
        <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
          <img
            src={file.content}
            alt={file.name}
            className="max-w-full max-h-[60vh] object-contain rounded"
          />
        </div>
      )
    }

    if (isText && file.content) {
      return (
        <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-auto">
          <pre className="text-xs whitespace-pre-wrap font-mono">{file.content}</pre>
        </div>
      )
    }

    if (isPDF) {
      return (
        <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg p-8 text-center">
          <FileText size={48} className="text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">
            PDF preview is not available in browser
          </p>
          <p className="text-xs text-muted-foreground">
            Download to view
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg p-8 text-center">
        <FileText size={48} className="text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          Preview not available for this file type
        </p>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold truncate pr-8">
              {file.name}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span>{file.type}</span>
            <span>•</span>
            <span>{formatFileSize(file.size)}</span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {renderPreviewContent()}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-2"
          >
            <DownloadSimple size={16} />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
