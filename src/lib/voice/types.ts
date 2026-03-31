/**
 * High-level UX/session state for a voice interaction (vendor-neutral).
 * Distinct from wire-level {@link VoiceConnectionState}.
 *
 * FSM (intended transitions; implementors should align):
 *
 * | From \\ To     | idle | connecting | listening | thinking | speaking | interrupted | disconnected | error |
 * |----------------|------|------------|-----------|----------|----------|-------------|--------------|-------|
 * | (initial)      |  —   | connect    |           |          |          |             |              |       |
 * | idle           |      | connect    |           |          |          |             |              | fail  |
 * | connecting     |      |            | ok        |          |          |             | disconnect   | fail  |
 * | listening      |      |            |           | response |          | barge-in    | disconnect   | fail  |
 * | thinking       |      |            | cancel/done |        | audio    | barge-in    | disconnect   | fail  |
 * | speaking       |      |            | done      |          |          | barge-in    | disconnect   | fail  |
 * | interrupted    |      |            | speech_stopped / speech_started | | |      | disconnect   | fail  |
 * | disconnected   |      | connect    |           |          |          |             |              |       |
 * | error          |      | connect¹   |           |          |          |             | disconnect   |       |
 *
 * ¹ Reconnect may be allowed depending on product; session implementation resets resources on connect.
 *
 * Notes:
 * - `idle` = never connected this lifetime; `disconnected` = cleanly closed after connect (or user hung up).
 * - `interrupted`: user barge-in while assistant was thinking or speaking; should return to `listening`
 *   on `input_audio_buffer.speech_stopped`, or immediately if cancel hits before audio (`response.cancelled`
 *   while not actively outputting audio).
 */
export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'disconnected'
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

/** User utterance as text (e.g. input audio transcription). */
export interface VoiceTranscriptionPayload {
  text: string
  /** True when this text is a final segment (e.g. completed utterance). */
  isFinal: boolean
  timestamp: number
}

/** Assistant reply text (streaming deltas and/or completion). */
export interface VoiceResponseTextPayload {
  text: string
  /** False while streaming; true when this update completes the assistant text for the turn. */
  isFinal: boolean
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
  /** User speech transcribed to text (no need to read raw Realtime events). */
  transcription: VoiceTranscriptionPayload
  /** Assistant text output (deltas and done; no need to read raw Realtime events). */
  response_text: VoiceResponseTextPayload
  error: VoiceErrorPayload
  connection_state_changed: VoiceConnectionStateChangedPayload
  state_changed: VoiceSessionStateChangedPayload
}

export type VoiceEventName = keyof VoiceEventMap

export type VoiceEventHandler<E extends VoiceEventName> = (payload: VoiceEventMap[E]) => void
