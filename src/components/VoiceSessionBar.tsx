import { Button } from '@/components/ui/button'
import { useVoiceSession } from '@/contexts/VoiceSessionContext'
import type { VoiceSessionState } from '@/lib/voice/types'
import { Microphone, Spinner, StopCircle, WarningCircle } from '@phosphor-icons/react'

function stateLabel(state: VoiceSessionState): string {
  switch (state) {
    case 'idle':
      return 'Idle'
    case 'connecting':
      return 'Connecting…'
    case 'listening':
      return 'Listening'
    case 'thinking':
      return 'Thinking'
    case 'speaking':
      return 'Speaking'
    case 'interrupted':
      return 'Interrupted'
    case 'error':
      return 'Error'
    default:
      return state
  }
}

export function VoiceSessionBar() {
  const { voiceState, isVoiceConnected, isVoiceConnecting, stopVoice } = useVoiceSession()

  const show =
    isVoiceConnecting || isVoiceConnected || voiceState === 'error' || voiceState === 'interrupted'
  if (!show) {
    return null
  }

  const busy = isVoiceConnecting || voiceState === 'connecting'
  const errored = voiceState === 'error'

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
    >
      <span className="inline-flex items-center gap-2 text-foreground">
        {busy ? (
          <Spinner className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        ) : errored ? (
          <WarningCircle className="h-4 w-4 text-destructive shrink-0" weight="fill" aria-hidden />
        ) : (
          <Microphone className="h-4 w-4 shrink-0" weight="fill" aria-hidden />
        )}
        <span>
          Voice: <strong className="font-medium">{stateLabel(voiceState)}</strong>
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto shrink-0"
        onClick={() => stopVoice()}
        aria-label="End voice session"
      >
        <StopCircle className="h-4 w-4 mr-1.5" aria-hidden />
        End voice
      </Button>
    </div>
  )
}
