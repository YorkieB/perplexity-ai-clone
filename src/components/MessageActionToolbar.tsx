import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowsClockwise,
  Article,
  Copy,
  DownloadSimple,
  Lock,
  LockOpen,
  SpeakerHigh,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { estimateTokensApprox } from '@/lib/llm-context-budget'
import { exportDocx, exportMarkdownFile, exportPdf, markdownToPlainText } from '@/lib/message-export'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FileText } from 'lucide-react'
import { PREFERRED_TTS_VOICE_KEY } from '@/lib/chat-preferences'
import { getEffectiveTtsVoice, getEffectiveTtsVoiceLabel, playTts } from '@/lib/tts'

interface MessageActionToolbarProps {
  markdownContent: string
  onRegenerate?: () => void
  disabled?: boolean
}

function safeBaseName() {
  return `reply-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
}

export function MessageActionToolbar({
  markdownContent,
  onRegenerate,
  disabled = false,
}: MessageActionToolbarProps) {
  const [pinned, setPinned] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [ttsVoice, setTtsVoice] = useState(() => getEffectiveTtsVoice())
  const ttsCancelRef = useRef<(() => void) | null>(null)

  const plain = markdownToPlainText(markdownContent)
  const approxTokens = estimateTokensApprox(markdownContent)

  useEffect(() => {
    const sync = () => setTtsVoice(getEffectiveTtsVoice())
    window.addEventListener('preferred-tts-voice-changed', sync)
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFERRED_TTS_VOICE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('preferred-tts-voice-changed', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    return () => {
      ttsCancelRef.current?.()
      ttsCancelRef.current = null
      speechSynthesis.cancel()
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleSpeak = useCallback(() => {
    if (ttsCancelRef.current) {
      ttsCancelRef.current()
      ttsCancelRef.current = null
      setSpeaking(false)
      return
    }
    if (!plain.trim()) {
      toast.message('Nothing to read')
      return
    }
    setSpeaking(true)
    const { done, cancel } = playTts(plain, { voice: ttsVoice })
    ttsCancelRef.current = cancel
    void done.finally(() => {
      ttsCancelRef.current = null
      setSpeaking(false)
    })
  }, [plain, ttsVoice])

  const base = safeBaseName()

  const readAloudTooltip = speaking
    ? 'Stop'
    : `Read aloud · ${getEffectiveTtsVoiceLabel()} · fallback: browser speech (en-GB)`

  const runExport = async (kind: 'pdf' | 'md' | 'docx') => {
    try {
      if (kind === 'md') exportMarkdownFile(markdownContent, base)
      else if (kind === 'pdf') exportPdf(markdownContent, base)
      else await exportDocx(markdownContent, base)
      toast.success('Download started')
    } catch (e) {
      console.error(e)
      toast.error('Export failed')
    }
  }

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-0.5 border-t border-border/60 pt-3',
        disabled && 'pointer-events-none opacity-50'
      )}
      role="toolbar"
      aria-label="Message actions"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            aria-pressed={pinned}
            onClick={() => setPinned((p) => !p)}
          >
            {pinned ? <Lock size={18} weight="regular" /> : <LockOpen size={18} weight="regular" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{pinned ? 'Unpin' : 'Pin'}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              >
                <DownloadSimple size={18} weight="regular" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Export</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuItem onSelect={() => runExport('pdf')}>
            <FileText className="size-4 opacity-70" />
            PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runExport('md')}>
            <span className="font-mono text-xs font-semibold text-muted-foreground">M↓</span>
            Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void runExport('docx')}>
            <FileText className="size-4 opacity-70" />
            DOCX
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onClick={() => void handleCopy()}
          >
            <Copy size={18} weight="regular" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copy</TooltipContent>
      </Tooltip>

      {onRegenerate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              onClick={onRegenerate}
            >
              <ArrowsClockwise size={18} weight="regular" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Regenerate</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              speaking && 'bg-muted text-foreground'
            )}
            onClick={handleSpeak}
            aria-pressed={speaking}
          >
            <SpeakerHigh size={18} weight={speaking ? 'fill' : 'regular'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-balance">
          {readAloudTooltip}
        </TooltipContent>
      </Tooltip>

      <div className="ml-1 flex items-center gap-1 pl-1 text-xs text-muted-foreground">
        <Article size={16} weight="regular" className="opacity-70" aria-hidden />
        <span className="tabular-nums text-accent" title="Approximate tokens">
          ~{approxTokens.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
