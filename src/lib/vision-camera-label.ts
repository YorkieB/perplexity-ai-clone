/**
 * Webcam selection for the Jarvis Visual Engine proxy (`/api/vision/*` → engine).
 * The engine matches `X-Jarvis-Camera-Label` as a substring against the OS device name.
 *
 * Default **`emeet`** matches eMeet C-series webcams and keeps behavior consistent on cold start.
 * Override with `VITE_VISION_CAMERA_LABEL` (e.g. `Integrated Camera`) if you use a different device.
 */
export const DEFAULT_VISION_CAMERA_LABEL = 'emeet'

export function getClientVisionCameraLabel(): string {
  const raw = import.meta.env.VITE_VISION_CAMERA_LABEL
  if (raw === undefined || raw === null) return DEFAULT_VISION_CAMERA_LABEL
  const t = String(raw).trim()
  return t === '' ? DEFAULT_VISION_CAMERA_LABEL : t
}

/** Headers for `/api/vision/*` requests from the browser. */
export function getVisionCameraLabelHeaders(): Record<string, string> {
  return { 'X-Jarvis-Camera-Label': getClientVisionCameraLabel() }
}
