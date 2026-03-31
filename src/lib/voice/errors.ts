export type VoiceRealtimeErrorCode =
  | 'SESSION_BOOTSTRAP_FAILED'
  | 'WEBRTC_NEGOTIATION_FAILED'
  | 'MISSING_EPHEMERAL_KEY'
  | 'DATA_CHANNEL_FAILED'
  | 'NOT_SUPPORTED'
  | 'USER_MEDIA_DENIED'
  /** Unexpected failure not already classified as another code (see `cause`). */
  | 'INTERNAL_ERROR'

/** Typed failure for OpenAI Realtime / WebRTC voice sessions. */
export class VoiceRealtimeError extends Error {
  readonly code: VoiceRealtimeErrorCode

  constructor(code: VoiceRealtimeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VoiceRealtimeError'
    this.code = code
  }
}
