/** Client-side guardrails (server may enforce stricter limits; see `vite-plugins/openai-proxy.ts`). */

/** Minimum ms between voice session start attempts (abuse / accidental double-tap). */
export const VOICE_START_COOLDOWN_MS = 8_000

/** Max continuous voice session length before auto-stop (client-side; refresh to extend). */
export const VOICE_MAX_SESSION_MS = 55 * 60 * 1000 // 55 min (under common 60m Realtime caps)
