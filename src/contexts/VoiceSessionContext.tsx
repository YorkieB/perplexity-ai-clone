import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'
import { isVoiceRealtimeError, toastBodyForVoiceError, voiceCopy } from '@/lib/voice/uxCopy'
import { VOICE_MAX_SESSION_MS, VOICE_START_COOLDOWN_MS } from '@/lib/voice/voiceLimits'
import type { VoiceSessionState } from '@/lib/voice/types'

export type VoiceInputMode = 'open' | 'ptt'

export interface VoiceSessionContextValue {
  voiceState: VoiceSessionState
  isVoiceConnected: boolean
  isVoiceConnecting: boolean
  voiceInputMode: VoiceInputMode
  setVoiceInputMode: (mode: VoiceInputMode) => void
  /** Push-to-talk: true while Space or PTT button is held (only meaningful in `ptt` mode). */
  pttActive: boolean
  setPttActive: (active: boolean) => void
  startVoice: () => Promise<void>
  stopVoice: () => void
  retryVoice: () => Promise<void>
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null)

function showVoiceErrorToast(
  err: unknown,
  retry: () => void | Promise<void>,
  exit: () => void
): void {
  const { title, description } = toastBodyForVoiceError(err)
  toast.error(title, {
    description,
    duration: 14_000,
    action: {
      label: voiceCopy.retry,
      onClick: () => {
        void retry()
      },
    },
    cancel: {
      label: voiceCopy.exitVoice,
      onClick: () => exit(),
    },
  })
}

export function VoiceSessionProvider({
  children,
  onUserTranscript,
  onAssistantTranscript,
}: {
  children: ReactNode
  onUserTranscript: (text: string) => void
  onAssistantTranscript: (text: string, meta: { interrupted: boolean }) => void
}) {
  const [voiceState, setVoiceState] = useState<VoiceSessionState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [pttActive, setPttActive] = useState(false)

  const [voiceInputMode, setVoiceInputMode] = useLocalStorage<VoiceInputMode>('voice-input-mode', 'open')

  const sessionRef = useRef<OpenAIRealtimeVoiceSession | null>(null)
  const onUserRef = useRef(onUserTranscript)
  const onAssistantRef = useRef(onAssistantTranscript)
  const voiceInputModeRef = useRef(voiceInputMode)
  /** After a failed start, blocks rapid retries (abuse / API hammering). Cleared on success. */
  const nextAllowedStartRef = useRef(0)
  const sessionStartedAtRef = useRef<number | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  onUserRef.current = onUserTranscript
  onAssistantRef.current = onAssistantTranscript
  voiceInputModeRef.current = voiceInputMode

  const stopVoice = useCallback(() => {
    sessionRef.current?.disconnect()
    setIsConnected(false)
    setIsConnecting(false)
    setPttActive(false)
    sessionStartedAtRef.current = null
    if (maxDurationTimerRef.current) {
      clearInterval(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }
  }, [])

  const startVoice = useCallback(async () => {
    const now = Date.now()
    if (now < nextAllowedStartRef.current) {
      toast.warning(voiceCopy.cooldownTitle, { description: voiceCopy.cooldownDescription })
      return
    }

    if (!sessionRef.current) {
      const s = new OpenAIRealtimeVoiceSession({
        onUserTranscriptComplete: (text) => onUserRef.current(text),
        onAssistantTranscriptComplete: (text, meta) => onAssistantRef.current(text, meta),
        startWithMicMuted: voiceInputModeRef.current === 'ptt',
      })
      s.on('state_changed', (p) => setVoiceState(p.state))
      s.on('connection_state_changed', (p) => {
        const connected = p.state === 'connected'
        setIsConnected(connected)
        if (p.state === 'connecting') {
          setIsConnecting(true)
        }
        if (p.state === 'connected' || p.state === 'failed' || p.state === 'disconnected') {
          setIsConnecting(false)
        }
      })
      s.on('error', (p) => {
        setIsConnecting(false)
        setIsConnected(false)
        showVoiceErrorToast(
          p.error,
          async () => {
            nextAllowedStartRef.current = 0
            await startVoiceRef.current()
          },
          () => stopVoiceRef.current()
        )
      })
      sessionRef.current = s
    }

    const s = sessionRef.current
    setIsConnecting(true)
    try {
      await s.connect({ startWithMicMuted: voiceInputModeRef.current === 'ptt' })
      nextAllowedStartRef.current = 0
      sessionStartedAtRef.current = Date.now()
      if (voiceInputModeRef.current === 'open') {
        s.setMicrophoneEnabled(true)
      } else {
        setPttActive(false)
        s.setMicrophoneEnabled(false)
      }
    } catch (e) {
      setIsConnecting(false)
      nextAllowedStartRef.current = Date.now() + VOICE_START_COOLDOWN_MS
      if (isVoiceRealtimeError(e) && e.code === 'USER_MEDIA_DENIED') {
        toast.error(toastBodyForVoiceError(e).title, {
          description: toastBodyForVoiceError(e).description,
          duration: 12_000,
          cancel: {
            label: voiceCopy.exitVoice,
            onClick: () => stopVoiceRef.current(),
          },
        })
      } else {
        showVoiceErrorToast(
          e,
          async () => {
            nextAllowedStartRef.current = 0
            await startVoiceRef.current()
          },
          () => stopVoiceRef.current()
        )
      }
    }
  }, [])

  const startVoiceRef = useRef(startVoice)
  const stopVoiceRef = useRef(stopVoice)
  startVoiceRef.current = startVoice
  stopVoiceRef.current = stopVoice

  const retryVoice = useCallback(async () => {
    nextAllowedStartRef.current = 0
    stopVoice()
    await startVoice()
  }, [startVoice, stopVoice])

  useEffect(() => {
    const s = sessionRef.current
    if (!s || !isConnected) {
      return
    }
    if (voiceInputMode === 'open') {
      s.setMicrophoneEnabled(true)
    } else {
      s.setMicrophoneEnabled(pttActive)
    }
  }, [voiceInputMode, pttActive, isConnected])

  useEffect(() => {
    if (!isConnected || sessionStartedAtRef.current === null) {
      return
    }
    const tick = () => {
      const start = sessionStartedAtRef.current
      if (start === null) {
        return
      }
      if (Date.now() - start > VOICE_MAX_SESSION_MS) {
        toast.info(voiceCopy.sessionMaxTitle, { description: voiceCopy.sessionMaxDescription })
        stopVoice()
      }
    }
    maxDurationTimerRef.current = setInterval(tick, 15_000)
    tick()
    return () => {
      if (maxDurationTimerRef.current) {
        clearInterval(maxDurationTimerRef.current)
        maxDurationTimerRef.current = null
      }
    }
  }, [isConnected, stopVoice])

  useEffect(() => {
    if (voiceInputMode !== 'ptt' || !isConnected) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') {
        return
      }
      const t = e.target
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      if (e.repeat) {
        return
      }
      setPttActive(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') {
        return
      }
      const t = e.target
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setPttActive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [voiceInputMode, isConnected])

  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect()
      sessionRef.current = null
    }
  }, [])

  const value = useMemo<VoiceSessionContextValue>(
    () => ({
      voiceState,
      isVoiceConnected: isConnected,
      isVoiceConnecting: isConnecting,
      voiceInputMode,
      setVoiceInputMode,
      pttActive,
      setPttActive,
      startVoice,
      stopVoice,
      retryVoice,
    }),
    [
      voiceState,
      isConnected,
      isConnecting,
      voiceInputMode,
      setVoiceInputMode,
      pttActive,
      startVoice,
      stopVoice,
      retryVoice,
    ]
  )

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with provider
export function useVoiceSession(): VoiceSessionContextValue {
  const ctx = useContext(VoiceSessionContext)
  if (!ctx) {
    throw new Error('useVoiceSession must be used within VoiceSessionProvider')
  }
  return ctx
}
