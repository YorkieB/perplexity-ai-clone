import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Camera, Image as ImageIcon, Microphone, Stop, X } from '@phosphor-icons/react'
import { callLlmStream, type ChatUserContentPart } from '@/lib/llm'
import { executeWebSearch } from '@/lib/api'
import { getEffectiveTtsVoice, playTts } from '@/lib/tts'
import { getPreferredChatModel } from '@/lib/chat-preferences'
import type { FocusMode, TimeRange } from '@/lib/types'

type VoicePhase = 'listening' | 'thinking' | 'speaking'

interface VoiceConversationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  focusMode: FocusMode
  timeRange: TimeRange
  workspaceSystemPrompt?: string
}

export function VoiceConversationModal({
  open,
  onOpenChange,
  focusMode,
  timeRange,
  workspaceSystemPrompt,
}: VoiceConversationModalProps) {
  const [phase, setPhase] = useState<VoicePhase>('listening')
  const [useVoiceSearch, setUseVoiceSearch] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [lastReply, setLastReply] = useState('')
  const [visionAttachment, setVisionAttachment] = useState<{ dataUrl: string } | null>(null)
  const visionRef = useRef<{ dataUrl: string } | null>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const voiceCtxRef = useRef({
    focusMode,
    timeRange,
    useVoiceSearch,
    workspaceSystemPrompt,
  })
  voiceCtxRef.current = { focusMode, timeRange, useVoiceSearch, workspaceSystemPrompt }

  visionRef.current = visionAttachment

  const phaseRef = useRef<VoicePhase>('listening')
  const openRef = useRef(open)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const ttsCancelRef = useRef<(() => void) | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const runVoiceTurnRef = useRef<(userText: string) => Promise<void>>(async () => {})

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    openRef.current = open
  }, [open])

  const onVisionFileChosen = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (f.size > 4 * 1024 * 1024) {
      toast.error('Image must be under 4 MB.')
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error('read failed'))
        r.readAsDataURL(f)
      })
      setVisionAttachment({ dataUrl })
      visionRef.current = { dataUrl }
      toast.success('Image attached for the next reply.')
    } catch {
      toast.error('Could not read the image.')
    }
  }, [])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    ttsCancelRef.current?.()
    ttsCancelRef.current = null
    speechSynthesis.cancel()
  }, [])

  const runVoiceTurn = useCallback(
    async (userText: string) => {
      if (busyRef.current) return
      busyRef.current = true
      interrupt()

      const model = getPreferredChatModel()
      if (model.startsWith('a2e-')) {
        toast.error('Choose a text chat model (not A2E) for voice.')
        busyRef.current = false
        return
      }

      const { focusMode: fm, timeRange: tr, useVoiceSearch: uvs, workspaceSystemPrompt: ws } =
        voiceCtxRef.current
      const systemPrompt = ws?.trim()
        ? `You are a helpful assistant. ${ws.trim()}`
        : 'You are a helpful assistant.'

      const ac = new AbortController()
      abortRef.current = ac
      setPhase('thinking')
      phaseRef.current = 'thinking'
      setLastReply('')

      try {
        recognitionRef.current?.stop()

        let userMessage = userText
        if (uvs && fm !== 'chat') {
          const searchResult = await executeWebSearch(userText, fm, false)
          if ('error' in searchResult) {
            toast.warning(searchResult.message)
          } else {
            const block = searchResult
              .map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet || s.rawContent || ''}`)
              .join('\n\n')
            userMessage = `${userText}\n\nUse these web results when helpful:\n${block}`
          }
        }

        const img = visionRef.current
        let userContentParts: ChatUserContentPart[] | undefined
        if (img?.dataUrl) {
          userContentParts = [
            { type: 'text', text: userMessage },
            { type: 'image_url', image_url: { url: img.dataUrl } },
          ]
        }

        let full = ''
        for await (const delta of callLlmStream(userMessage, model, {
          signal: ac.signal,
          systemPrompt,
          userContentParts,
        })) {
          full += delta.content ?? ''
          setLastReply(full)
        }

        if (ac.signal.aborted) return

        if (!full.trim()) {
          toast.warning('The model returned an empty reply.')
          return
        }

        setPhase('speaking')
        phaseRef.current = 'speaking'
        const { done, cancel } = playTts(full, { signal: ac.signal, voice: getEffectiveTtsVoice() })
        ttsCancelRef.current = cancel
        await done
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        console.error(e)
        toast.error('Voice turn failed. Try again.')
      } finally {
        ttsCancelRef.current = null
        abortRef.current = null
        busyRef.current = false
        setPhase('listening')
        phaseRef.current = 'listening'
        if (openRef.current) {
          try {
            recognitionRef.current?.start()
          } catch {
            /* already running */
          }
        }
      }
    },
    [interrupt]
  )

  runVoiceTurnRef.current = runVoiceTurn

  useEffect(() => {
    if (!open) {
      interrupt()
      recognitionRef.current?.abort()
      recognitionRef.current = null
      setPhase('listening')
      setLastHeard('')
      setVisionAttachment(null)
      visionRef.current = null
      return
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      toast.error('Speech recognition is not supported in this browser.')
      return
    }

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const piece = r[0]?.transcript ?? ''
        if (!r.isFinal) {
          interim += piece
        }
      }

      if (
        interim.trim() &&
        (phaseRef.current === 'speaking' || phaseRef.current === 'thinking')
      ) {
        interrupt()
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const transcript = (r[0]?.transcript ?? '').trim()
        if (r.isFinal && transcript) {
          setLastHeard(transcript)
          void runVoiceTurnRef.current(transcript)
          break
        }
      }
    }

    recognition.onerror = () => {
      /* browsers may emit errors when stopping recognition */
    }

    recognition.onend = () => {
      if (openRef.current && phaseRef.current === 'listening' && !busyRef.current) {
        try {
          recognition.start()
        } catch {
          /* already started */
        }
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      toast.error('Could not start the microphone.')
    }

    return () => {
      recognition.abort()
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }
  }, [open, interrupt])

  const handleClose = (next: boolean) => {
    if (!next) {
      interrupt()
      recognitionRef.current?.abort()
    }
    onOpenChange(next)
  }

  const phaseLabel =
    phase === 'listening' ? 'Listening' : phase === 'thinking' ? 'Thinking' : 'Speaking'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Microphone size={22} className="text-accent" weight="bold" />
            Voice conversation
          </DialogTitle>
          <DialogDescription>
            Speak naturally. The assistant reads replies aloud. Speak while it talks to interrupt
            (barge-in). Attach an image to ask questions about what you see (use a vision-capable
            model such as gpt-4o or gpt-4o-mini).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Vision (optional)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                onChange={onVisionFileChosen}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={onVisionFileChosen}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon size={16} />
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => cameraInputRef.current?.click()}
                title="Opens the camera on phones/tablets when supported"
              >
                <Camera size={16} />
                Camera
              </Button>
              {visionAttachment && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={() => {
                    setVisionAttachment(null)
                    visionRef.current = null
                  }}
                >
                  <X size={16} />
                  Remove
                </Button>
              )}
            </div>
            {visionAttachment && (
              <div className="flex items-start gap-3 pt-1">
                <img
                  src={visionAttachment.dataUrl}
                  alt="Attached for vision"
                  className="max-h-28 max-w-[200px] rounded-md border border-border object-contain bg-background"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your next spoken question will include this image. Ask aloud what you want to know
                  about it.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="voice-search" className="text-sm font-medium">
                Ground with web search
              </Label>
              <p className="text-xs text-muted-foreground">
                Uses Tavily when not in Chat-only focus (same as the main search bar).
              </p>
            </div>
            <Switch
              id="voice-search"
              checked={useVoiceSearch}
              onCheckedChange={setUseVoiceSearch}
              disabled={focusMode === 'chat'}
            />
          </div>

          <div className="rounded-lg border border-border p-4 space-y-2 min-h-[100px]">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Status — {phaseLabel}
            </p>
            {lastHeard && (
              <p className="text-sm">
                <span className="text-muted-foreground">You: </span>
                {lastHeard}
              </p>
            )}
            {lastReply && (
              <p className="text-sm whitespace-pre-wrap">
                <span className="text-muted-foreground">Assistant: </span>
                {lastReply}
              </p>
            )}
            {!lastHeard && !lastReply && (
              <p className="text-sm text-muted-foreground">Waiting for speech…</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                interrupt()
                setLastReply('')
                setLastHeard('')
                setVisionAttachment(null)
                visionRef.current = null
              }}
            >
              <Stop size={16} className="mr-1" />
              Stop &amp; clear
            </Button>
            <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
