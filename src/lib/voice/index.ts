export type {
  VoiceAssistantAudioStartedPayload,
  VoiceAssistantAudioStoppedPayload,
  VoiceConnectionState,
  VoiceConnectionStateChangedPayload,
  VoiceErrorPayload,
  VoiceEventHandler,
  VoiceEventMap,
  VoiceEventName,
  VoiceResponseTextPayload,
  VoiceSessionState,
  VoiceSessionStateChangedPayload,
  VoiceTranscriptionPayload,
  VoiceTurn,
  VoiceUserSpeechStartedPayload,
  VoiceUserSpeechStoppedPayload,
} from '@/lib/voice/types'

export type { VoiceSession } from '@/lib/voice/voiceSession'

export { normalizeRealtimeServerEventType } from '@/lib/voice/realtimeServerEvents'
export { NullVoiceSession } from '@/lib/voice/voiceSession'
/** @deprecated Use {@link NullVoiceSession} instead. */
export { VoiceSessionStub } from '@/lib/voice/voiceSession'

export type { VoiceRealtimeErrorCode } from '@/lib/voice/errors'
export { VoiceRealtimeError } from '@/lib/voice/errors'
export type {
  OpenAIRealtimeVoiceSessionOptions,
  RealtimeClientSecretPayload,
} from '@/lib/voice/openaiRealtimeVoiceSession'
export { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'
