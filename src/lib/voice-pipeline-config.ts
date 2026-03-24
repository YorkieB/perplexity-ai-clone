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

export type VoicePipelineStrategy = typeof VOICE_PIPELINE_STRATEGY
