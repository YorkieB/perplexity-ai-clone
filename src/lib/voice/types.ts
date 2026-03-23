/**
 * High-level UX/session state for a voice interaction (vendor-neutral).
 * Distinct from wire-level {@link VoiceConnectionState}.
 */
export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error'

/**
 * Transport/session connection to a voice backend (e.g. WebSocket lifecycle).
 * Not every implementation must emit all transitions.
 */
export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed'

/**
 * Optional metadata for a message or turn that originated from or relates to voice.
 */
export interface VoiceTurn {
  readonly source: 'voice'
  /** True when user or system cut off assistant playback or generation. */
  interrupted?: boolean
  startedAt?: number
  endedAt?: number
}

/** Payloads for {@link VoiceEventMap} (all include a monotonic clock when relevant). */
export interface VoiceUserSpeechStartedPayload {
  timestamp: number
}

export interface VoiceUserSpeechStoppedPayload {
  timestamp: number
}

export interface VoiceAssistantAudioStartedPayload {
  timestamp: number
}

export interface VoiceAssistantAudioStoppedPayload {
  timestamp: number
}

export interface VoiceErrorPayload {
  error: Error
  timestamp: number
}

export interface VoiceConnectionStateChangedPayload {
  state: VoiceConnectionState
  timestamp: number
}

/** Emitted when {@link VoiceSessionState} changes (FSM updates). */
export interface VoiceSessionStateChangedPayload {
  state: VoiceSessionState
  timestamp: number
}

/**
 * Typed event map for voice sessions. Use with {@link VoiceSession} `on` / `off`.
 */
export interface VoiceEventMap {
  user_speech_started: VoiceUserSpeechStartedPayload
  user_speech_stopped: VoiceUserSpeechStoppedPayload
  assistant_audio_started: VoiceAssistantAudioStartedPayload
  assistant_audio_stopped: VoiceAssistantAudioStoppedPayload
  error: VoiceErrorPayload
  connection_state_changed: VoiceConnectionStateChangedPayload
  state_changed: VoiceSessionStateChangedPayload
}

export type VoiceEventName = keyof VoiceEventMap

export type VoiceEventHandler<E extends VoiceEventName> = (payload: VoiceEventMap[E]) => void
