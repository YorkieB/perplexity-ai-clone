/**
 * Voice / Gemini-like pipeline strategy for this app.
 *
 * - **composed**: Browser STT (Web Speech API) → POST /api/llm (optionally streaming + optional vision
 *   image parts) → TTS (OpenAI audio via /api/tts with server key, or speechSynthesis fallback).
 * - Gemini Multimodal Live (WebSocket) is not implemented here; add a dedicated client + wss proxy later if needed.
 *
 * Targets: Vite dev/preview and Electron production (same-origin /api/* proxies).
 */
export const VOICE_PIPELINE_STRATEGY = 'composed' as const

/**
 * Additional backend discriminants — start as `never` and replace with string literals as
 * implementations land (e.g. `'realtime_webrtc'`, `'gemini_live'`). Keeps {@link VoicePipelineStrategy}
 * open for extension without widening the runtime {@link VOICE_PIPELINE_STRATEGY} constant.
 */
type FutureVoicePipelineStrategy = never

/** Union of supported and planned pipeline strategies; only {@link VOICE_PIPELINE_STRATEGY} is active today. */
export type VoicePipelineStrategy = typeof VOICE_PIPELINE_STRATEGY | FutureVoicePipelineStrategy
