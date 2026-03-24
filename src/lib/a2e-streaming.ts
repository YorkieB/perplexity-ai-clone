/**
 * A2E streaming avatars (real-time WebRTC) are separate from REST `/api/v1/*` jobs.
 * Configure where users open the streaming workspace (web console).
 */
const DEFAULT_CONSOLE = 'https://video.a2e.ai'

export function getA2eStreamingConsoleUrl(): string {
  try {
    const v = import.meta.env.VITE_A2E_STREAMING_URL
    if (typeof v === 'string' && v.trim()) return v.trim()
  } catch {
    /* ignore */
  }
  return DEFAULT_CONSOLE
}

export const A2E_STREAMING_API_ROOT = 'https://api.a2e.ai/'

export const A2E_STREAMING_HELP = {
  tutorial: 'https://www.a2e.ai/tutorial',
  discord: 'https://discord.gg/batesPBQUE',
} as const
