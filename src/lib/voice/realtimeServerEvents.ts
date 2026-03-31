/**
 * GA Realtime renamed several server events; map them to stable names used by
 * {@link OpenAIRealtimeVoiceSession} and {@link useRealtimeVoice}.
 */
export function normalizeRealtimeServerEventType(raw: unknown): string {
  const t = typeof raw === 'string' ? raw : ''
  switch (t) {
    case 'response.output_audio.delta':
      return 'response.audio.delta'
    case 'response.output_audio_transcript.delta':
      return 'response.audio_transcript.delta'
    case 'response.output_text.delta':
      return 'response.text.delta'
    case 'response.output_text.done':
      return 'response.text.done'
    case 'response.completed':
      return 'response.done'
    default:
      return t
  }
}
