export type {
  VoiceAssistantAudioStartedPayload,
  VoiceAssistantAudioStoppedPayload,
  VoiceConnectionState,
  VoiceConnectionStateChangedPayload,
  VoiceErrorPayload,
  VoiceEventHandler,
  VoiceEventMap,
  VoiceEventName,
  VoiceSessionState,
  VoiceSessionStateChangedPayload,
  VoiceTurn,
  VoiceUserSpeechStartedPayload,
  VoiceUserSpeechStoppedPayload,
} from '@/lib/voice/types'

export type { VoiceSession } from '@/lib/voice/voiceSession'
export { NullVoiceSession, VoiceSessionStub } from '@/lib/voice/voiceSession'

export type { VoiceRealtimeErrorCode } from '@/lib/voice/errors'
export { VoiceRealtimeError } from '@/lib/voice/errors'
export type {
  OpenAIRealtimeVoiceSessionOptions,
  RealtimeClientSecretPayload,
} from '@/lib/voice/openaiRealtimeVoiceSession'
export { OpenAIRealtimeVoiceSession } from '@/lib/voice/openaiRealtimeVoiceSession'
export { VOICE_MAX_SESSION_MS, VOICE_START_COOLDOWN_MS } from '@/lib/voice/voiceLimits'
export { toastBodyForVoiceError, voiceCopy } from '@/lib/voice/uxCopy'
export {
  defaultRealtimeSessionBody,
  mergeRealtimeSessionBody,
  type RealtimeSessionRequestBody,
} from '@/lib/voice/realtimeSessionDefaults'
