/**
 * One-shot vision fetch for chat/voice turns — avoids stale React state from useVision polling.
 */

import { visionContextFromEnginePayload, type VisionContext } from '@/hooks/useVision'
import { getVisionCameraLabelHeaders } from '@/lib/vision-camera-label'

const OFFLINE: VisionContext = {
  connected: false,
  cameraConnected: false,
  faces: [],
  sceneDescription: null,
  visibleText: null,
  emotion: null,
  framesProcessed: 0,
  facesRecognized: 0,
  motionDetections: 0,
  apiCalls: 0,
  lastUpdated: null,
}

/**
 * POST /analyze (forces fresh LLM pass when engine supports it) then GET /context.
 * Use immediately before building a system prompt so the model sees current scene text.
 */
export async function fetchVisionContextForPrompt(): Promise<VisionContext> {
  const headers = { 'Content-Type': 'application/json', ...getVisionCameraLabelHeaders() }
  try {
    await fetch('/api/vision/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        include_visible_text: true,
        extract_readable_text: true,
        analysis_focus: 'scene_objects_and_readable_text',
      }),
    })
  } catch {
    /* engine may be offline */
  }
  try {
    const res = await fetch('/api/vision/context', { headers: getVisionCameraLabelHeaders() })
    if (!res.ok) return OFFLINE
    const data = (await res.json()) as Record<string, unknown>
    if (data.error && data.connected === undefined && !data.scene_description) {
      return OFFLINE
    }
    return visionContextFromEnginePayload(data)
  } catch {
    return OFFLINE
  }
}
