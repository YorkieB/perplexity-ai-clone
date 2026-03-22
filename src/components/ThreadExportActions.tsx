import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Thread } from '@/lib/types'
import {
  assistantMessageToMarkdown,
  copyTextToClipboard,
  downloadTextFile,
  findLastAssistantMessage,
  sanitizeFilenameBase,
  threadToMarkdown,
} from '@/lib/exportMarkdown'
import { toast } from 'sonner'
import { Copy, DownloadSimple, Export } from '@phosphor-icons/react'

interface ThreadExportActionsProps {
  thread: Thread
  workspaceName?: string | null
  disabled?: boolean
}

export function ThreadExportActions({ thread, workspaceName, disabled = false }: ThreadExportActionsProps) {
  const hasMessages = thread.messages.length > 0
  const lastAssistant = findLastAssistantMessage(thread.messages)
  const exportDisabled = disabled || !hasMessages

  const fullMd = () => threadToMarkdown(thread, { workspaceName: workspaceName ?? undefined })

  const handleDownloadThread = () => {
    try {
      const md = fullMd()
      const name = `${sanitizeFilenameBase(thread.title)}-${new Date().toISOString().slice(0, 10)}.md`
      downloadTextFile(name, md)
      toast.success('Download started')
    } catch (e) {
      console.error(e)
      toast.error('Could not export thread')
    }
  }

  const handleCopyThread = async () => {
    try {
      await copyTextToClipboard(fullMd())
      toast.success('Thread copied as Markdown')
    } catch (e) {
      console.error(e)
      toast.error('Could not copy to clipboard')
    }
  }

  const handleCopyLastAnswer = async () => {
    if (!lastAssistant) {
      toast.error('No assistant message yet')
      return
    }
    try {
      await copyTextToClipboard(assistantMessageToMarkdown(lastAssistant))
      toast.success('Last answer copied as Markdown')
    } catch (e) {
      console.error(e)
      toast.error('Could not copy to clipboard')
    }
  }

  const handleDownloadLastAnswer = () => {
    if (!lastAssistant) {
      toast.error('No assistant message yet')
      return
    }
    try {
      const md = assistantMessageToMarkdown(lastAssistant)
      const name = `${sanitizeFilenameBase(thread.title)}-last-answer-${new Date().toISOString().slice(0, 10)}.md`
      downloadTextFile(name, md)
      toast.success('Download started')
    } catch (e) {
      console.error(e)
      toast.error('Could not export answer')
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end sm:ml-auto">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled || !lastAssistant}
        onClick={handleCopyLastAnswer}
      >
        <Copy size={16} />
        <span className="hidden sm:inline">Copy last answer</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={exportDisabled}
          >
            <Export size={16} />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleDownloadThread}>
            <DownloadSimple size={16} className="mr-2" />
            Download thread (.md)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyThread}>
            <Copy size={16} className="mr-2" />
            Copy thread (Markdown)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadLastAnswer} disabled={!lastAssistant}>
            <DownloadSimple size={16} className="mr-2" />
            Download last answer (.md)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
