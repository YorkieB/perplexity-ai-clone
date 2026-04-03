/**
 * Compact vision summary for non-Realtime LLM calls (e.g. Voice Conversation modal).
 * Keeps wording aligned with Voice Mode / useVision without importing useRealtimeVoice.
 */

import type { VisionContext } from '@/hooks/useVision'

/**
 * Text for the Voice Conversation modal system prompt.
 * When the engine is unreachable we still return non-empty copy so the model does not
 * confabulate “browser webcam unplugged” — room vision is the Jarvis Visual Engine (`/api/vision`), not getUserMedia.
 */
export function formatVisionContextBlockForLlm(v: VisionContext | null | undefined): string {
  if (!v?.connected) {
    return `[VISION ENGINE UNAVAILABLE]
The app did not get a healthy response from GET /api/vision/context (engine down, wrong VISION_ENGINE_URL, or proxy error). You have no live room-camera analysis for this turn.
If the user asks what you see: say the **Jarvis Visual Engine** must be running (e.g. \`python -m jarvis_visual_engine\` or Electron auto-start via JARVIS_VISION_ENGINE_COMMAND) and reachable at VISION_ENGINE_URL (default http://127.0.0.1:5000). Suggest \`npm run verify:vision\`.
Do **not** say your own webcam is unplugged, that “the browser” cannot access a camera, or that you lack vision “in this interface” — this flow does not use the browser camera API; it uses the separate engine process.`
  }

  const parts: string[] = []
  if (v.lastUpdated) {
    parts.push(`Analysis time: ${v.lastUpdated}`)
  }
  if (v.sceneDescription?.trim()) {
    parts.push(`Scene: ${v.sceneDescription.trim()}`)
  }
  if (v.visibleText?.trim()) {
    parts.push(`Readable text in frame: ${v.visibleText.trim()}`)
  }
  if (v.emotion?.primary) {
    const c = Math.round((v.emotion.confidence ?? 0) * 100)
    parts.push(`Detected emotion: ${v.emotion.primary} (${c}% confidence)`)
  }
  if (v.faces.length > 0) {
    parts.push(
      `Recognized people: ${v.faces.map((f) => `${f.name} (${Math.round(f.confidence * 100)}%)`).join(', ')}`,
    )
  }

  if (!v.cameraConnected) {
    parts.unshift('(Camera path: engine reachable but frames not confirmed — describe only what appears below if any.)')
  }

  if (parts.length === 0) {
    return v.cameraConnected
      ? 'Vision service connected; scene summary still loading for this moment.'
      : 'Vision engine responded but returned no scene lines yet — say analysis may still be starting, or the frame was empty; do not claim the browser camera is disconnected.'
  }

  return parts.join('\n')
}
