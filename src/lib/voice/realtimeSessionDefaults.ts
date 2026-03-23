/**
 * Default POST body for `POST /v1/realtime/client_secrets` and merge helper for optional client overrides.
 * Shared by the Vite dev proxy and unit tests.
 */
export const defaultRealtimeSessionBody = {
  session: {
    type: 'realtime' as const,
    model: 'gpt-realtime',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transcription: { model: 'gpt-4o-mini-transcribe' },
      },
      output: { voice: 'marin' },
    },
  },
}

export type RealtimeSessionRequestBody = typeof defaultRealtimeSessionBody

export function mergeRealtimeSessionBody(raw: string): RealtimeSessionRequestBody {
  if (!raw.trim()) {
    return defaultRealtimeSessionBody
  }
  try {
    const parsed = JSON.parse(raw) as { session?: unknown }
    if (parsed?.session && typeof parsed.session === 'object' && parsed.session !== null) {
      return {
        session: {
          ...defaultRealtimeSessionBody.session,
          ...(parsed.session as Record<string, unknown>),
        } as RealtimeSessionRequestBody['session'],
      }
    }
  } catch {
    /* use default */
  }
  return defaultRealtimeSessionBody
}
