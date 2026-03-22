import { UploadedFile } from '@/lib/types'
import { formatFileSize } from '@/lib/helpers'
import { Button } from '@/components/ui/button'
import { X, File, FileText, Image, FileCsv } from '@phosphor-icons/react'

interface FileAttachmentProps {
  file: UploadedFile
  onRemove?: () => void
  showRemove?: boolean
}

export function FileAttachment({ file, onRemove, showRemove = true }: FileAttachmentProps) {
  const getFileIcon = () => {
    if (file.type.startsWith('image/')) {
      return <Image size={16} className="text-accent" />
    }
    if (file.type === 'text/csv') {
      return <FileCsv size={16} className="text-primary" />
    }
    if (file.type === 'text/plain' || file.type === 'text/markdown') {
      return <FileText size={16} className="text-muted-foreground" />
    }
    return <File size={16} className="text-muted-foreground" />
  }

  const renderPreview = () => {
    if (file.type.startsWith('image/') && file.content.startsWith('data:')) {
      return (
        <div className="mt-2">
          <img
            src={file.content}
            alt={file.name}
            className="max-w-full max-h-32 rounded border border-border object-contain"
          />
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-muted/50 border border-border rounded-lg p-2">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">{getFileIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{file.name}</div>
          <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
        </div>
        {showRemove && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0"
            onClick={onRemove}
          >
            <X size={12} />
          </Button>
        )}
      </div>
      {renderPreview()}
    </div>
  )
}
