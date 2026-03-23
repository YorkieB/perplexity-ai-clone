import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useVoiceSession } from '@/contexts/VoiceSessionContext'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { VoiceSessionState } from '@/lib/voice/types'
import { voiceCopy } from '@/lib/voice/uxCopy'
import { Headphones, Microphone, Spinner, StopCircle, WarningCircle } from '@phosphor-icons/react'

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
  const {
    voiceState,
    isVoiceConnected,
    isVoiceConnecting,
    stopVoice,
    voiceInputMode,
    setVoiceInputMode,
    pttActive,
    setPttActive,
  } = useVoiceSession()

  const [headphonesDismissed, setHeadphonesDismissed] = useLocalStorage('voice-headphones-dismissed', false)

  const show =
    isVoiceConnecting || isVoiceConnected || voiceState === 'error' || voiceState === 'interrupted'
  if (!show) {
    return null
  }

  const busy = isVoiceConnecting || voiceState === 'connecting'
  const errored = voiceState === 'error'

  const showHeadphonesTip = (isVoiceConnecting || isVoiceConnected) && !headphonesDismissed

  const onModeChange = (mode: 'open' | 'ptt') => {
    setVoiceInputMode(mode)
  }

  return (
    <div className="space-y-3">
      {showHeadphonesTip && (
        <div
          role="region"
          aria-label="Voice tip"
          className="flex flex-wrap items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          <Headphones className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p className="flex-1 min-w-[12rem] m-0">{voiceCopy.headphonesTip}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-8"
            onClick={() => setHeadphonesDismissed(true)}
            aria-label={voiceCopy.headphonesDismiss}
          >
            {voiceCopy.headphonesDismiss}
          </Button>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex items-center gap-2 ml-auto">
            <Label htmlFor="voice-input-mode" className="text-xs text-muted-foreground sr-only">
              {voiceCopy.inputModeOpen} or {voiceCopy.inputModePtt}
            </Label>
            <span className="text-xs text-muted-foreground hidden sm:inline">{voiceCopy.inputModeOpen}</span>
            <Switch
              id="voice-input-mode"
              checked={voiceInputMode === 'ptt'}
              onCheckedChange={(checked) => onModeChange(checked ? 'ptt' : 'open')}
              disabled={busy}
              aria-label={voiceInputMode === 'ptt' ? voiceCopy.inputModePtt : voiceCopy.inputModeOpen}
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">{voiceCopy.inputModePtt}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground m-0">
          {voiceInputMode === 'ptt' ? voiceCopy.pttHint : voiceCopy.openMicHint}
        </p>

        {voiceInputMode === 'ptt' && isVoiceConnected && !busy && (
          <Button
            type="button"
            variant={pttActive ? 'default' : 'secondary'}
            className="w-full touch-manipulation min-h-[44px]"
            onPointerDown={() => {
              setPttActive(true)
            }}
            onPointerUp={() => {
              setPttActive(false)
            }}
            onPointerLeave={() => setPttActive(false)}
            onPointerCancel={() => setPttActive(false)}
            aria-pressed={pttActive}
            aria-label="Hold to talk"
          >
            <Microphone className="h-4 w-4 mr-2" weight="fill" aria-hidden />
            Hold to talk
          </Button>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => stopVoice()}
            aria-label="End voice session"
          >
            <StopCircle className="h-4 w-4 mr-1.5" aria-hidden />
            End voice
          </Button>
        </div>
      </div>
    </div>
  )
}
