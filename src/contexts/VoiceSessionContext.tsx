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
import { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'
import type { VoiceSessionState } from '@/lib/voice/types'

export interface VoiceSessionContextValue {
  voiceState: VoiceSessionState
  isVoiceConnected: boolean
  isVoiceConnecting: boolean
  startVoice: () => Promise<void>
  stopVoice: () => void
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null)

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

  const sessionRef = useRef<OpenAIRealtimeVoiceSession | null>(null)
  const onUserRef = useRef(onUserTranscript)
  const onAssistantRef = useRef(onAssistantTranscript)
  onUserRef.current = onUserTranscript
  onAssistantRef.current = onAssistantTranscript

  const ensureSession = useCallback(() => {
    if (!sessionRef.current) {
      const s = new OpenAIRealtimeVoiceSession({
        onUserTranscriptComplete: (text) => onUserRef.current(text),
        onAssistantTranscriptComplete: (text, meta) => onAssistantRef.current(text, meta),
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
        toast.error(p.error.message)
        setIsConnecting(false)
      })
      sessionRef.current = s
    }
    return sessionRef.current
  }, [])

  const startVoice = useCallback(async () => {
    const s = ensureSession()
    setIsConnecting(true)
    try {
      await s.connect()
    } catch {
      setIsConnecting(false)
    }
  }, [ensureSession])

  const stopVoice = useCallback(() => {
    sessionRef.current?.disconnect()
    setIsConnected(false)
    setIsConnecting(false)
  }, [])

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
      startVoice,
      stopVoice,
    }),
    [voiceState, isConnected, isConnecting, startVoice, stopVoice]
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
