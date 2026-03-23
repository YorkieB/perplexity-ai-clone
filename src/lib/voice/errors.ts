export type VoiceRealtimeErrorCode =
  | 'SESSION_BOOTSTRAP_FAILED'
  | 'SESSION_RATE_LIMITED'
  | 'WEBRTC_NEGOTIATION_FAILED'
  | 'MISSING_EPHEMERAL_KEY'
  | 'DATA_CHANNEL_FAILED'
  | 'NOT_SUPPORTED'
  | 'USER_MEDIA_DENIED'
  | 'CONNECTION_LOST'

/** Typed failure for OpenAI Realtime / WebRTC voice sessions. */
export class VoiceRealtimeError extends Error {
  readonly code: VoiceRealtimeErrorCode

  constructor(code: VoiceRealtimeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'VoiceRealtimeError'
    this.code = code
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}
