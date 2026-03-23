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
