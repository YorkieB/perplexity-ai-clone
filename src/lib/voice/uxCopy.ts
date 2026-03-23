/**
 * Voice UX copy — single place for user-facing strings.
 *
 * Error handling matrix (maps to toasts; never log raw audio or PII):
 * | Source            | Condition                          | User message / action                          |
 * |-------------------|-------------------------------------|-----------------------------------------------|
 * | getUserMedia      | Permission denied / NotAllowedError | micDenied + Settings path                     |
 * | POST /api/realtime| 429                                 | sessionRateLimited + Retry / Exit               |
 * | POST /api/realtime| 5xx / parse error                   | sessionBootstrapFailed + Retry / Exit         |
 * | WebRTC            | Peer failed / ICE drop              | connectionLost + Retry / Exit                   |
 * | Data channel      | Closed while session active         | connectionLost (deduped in session)           |
 * | Realtime API      | Server `error` event JSON           | realtimeApiError (message from server if safe)|
 * | Client            | Cooldown / max duration             | cooldownActive / sessionMaxDuration            |
 */
import type { VoiceRealtimeError } from '@/lib/voice/errors'

export const voiceCopy = {
  headphonesTip: 'Headphones recommended for voice chat — reduces echo and accidental interruptions.',
  headphonesDismiss: 'Dismiss',

  inputModeOpen: 'Open mic',
  inputModePtt: 'Hold to talk',
  pttHint: 'Hold Space or the button below to speak.',
  openMicHint: 'Open mic — speak when ready.',

  micDeniedTitle: 'Microphone blocked',
  micDeniedDescription: 'Allow microphone access in your browser settings to use voice.',

  sessionRateLimitedTitle: 'Voice temporarily limited',
  sessionRateLimitedDescription: 'Too many requests. Wait a moment or try again.',

  sessionBootstrapFailedTitle: 'Could not start voice',
  sessionBootstrapFailedDescription: 'The voice service did not respond. Check your connection and API setup.',

  connectionLostTitle: 'Voice connection lost',
  connectionLostDescription: 'Your network or the voice service dropped the session.',

  realtimeApiErrorTitle: 'Voice error',

  cooldownTitle: 'Please wait',
  cooldownDescription: 'Voice was started recently. Try again in a few seconds.',

  sessionMaxTitle: 'Voice session limit',
  sessionMaxDescription: 'This session ended to save resources. Start voice again to continue.',

  retry: 'Retry',
  exitVoice: 'Exit voice',
} as const

export function isVoiceRealtimeError(err: unknown): err is VoiceRealtimeError {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'VoiceRealtimeError'
}

/** Safe, short description for toasts (no stack traces, no response bodies with secrets). */
export function toastBodyForVoiceError(err: unknown): { title: string; description?: string } {
  if (isVoiceRealtimeError(err)) {
    switch (err.code) {
      case 'USER_MEDIA_DENIED':
        return { title: voiceCopy.micDeniedTitle, description: voiceCopy.micDeniedDescription }
      case 'SESSION_RATE_LIMITED':
        return { title: voiceCopy.sessionRateLimitedTitle, description: voiceCopy.sessionRateLimitedDescription }
      case 'SESSION_BOOTSTRAP_FAILED':
        return { title: voiceCopy.sessionBootstrapFailedTitle, description: voiceCopy.sessionBootstrapFailedDescription }
      case 'CONNECTION_LOST':
        return { title: voiceCopy.connectionLostTitle, description: voiceCopy.connectionLostDescription }
      case 'NOT_SUPPORTED':
        return { title: voiceCopy.sessionBootstrapFailedTitle, description: err.message }
      default:
        return { title: voiceCopy.realtimeApiErrorTitle, description: err.message }
    }
  }
  if (err instanceof Error) {
    return { title: voiceCopy.realtimeApiErrorTitle, description: err.message }
  }
  return { title: voiceCopy.realtimeApiErrorTitle, description: voiceCopy.sessionBootstrapFailedDescription }
}
