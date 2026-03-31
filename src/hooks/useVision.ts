import { useState, useEffect, useRef, useCallback } from 'react'

export interface VisionFace {
  name: string
  confidence: number
}

export interface VisionEmotion {
  primary: string
  confidence: number
  secondary?: string
}

export interface VisionContext {
  connected: boolean
  cameraConnected: boolean
  faces: VisionFace[]
  sceneDescription: string | null
  /** OCR / UI / document text visible in frame (if the vision engine returns it). */
  visibleText: string | null
  emotion: VisionEmotion | null
  framesProcessed: number
  facesRecognized: number
  motionDetections: number
  apiCalls: number
  lastUpdated: string | null
}

/**
 * The visual engine often omits `camera_connected` or returns it late. Infer "camera path active"
 * from any real frame/scene signal so voice instructions and UI stay aligned with reality.
 */
function inferCameraActiveFromPayload(data: Record<string, unknown>): boolean {
  const frames =
    (data.frames_processed as number | undefined) ??
    (data.stats as { frames_processed?: number } | undefined)?.frames_processed ??
    0
  if (frames > 0) return true

  const sceneRaw = data.scene_description ?? data.analysis
  const sceneStr =
    typeof sceneRaw === 'string'
      ? sceneRaw
      : sceneRaw && typeof sceneRaw === 'object' && 'description' in sceneRaw && typeof (sceneRaw as { description?: unknown }).description === 'string'
        ? (sceneRaw as { description: string }).description
        : ''
  if (sceneStr.trim().length > 0) return true

  if (pickVisibleText(data)) return true
  if (Array.isArray(data.faces) && data.faces.length > 0) return true
  if (data.emotion != null) return true
  if (((data.motion_detections as number | undefined) ?? 0) > 0) return true
  return false
}

/** Normalize vision API payloads: many engines use different keys for on-screen text. */
function pickVisibleText(data: Record<string, unknown>): string | null {
  const directKeys = [
    'visible_text',
    'visibleText',
    'ocr_text',
    'ocrText',
    'screen_text',
    'screenText',
    'text_on_screen',
    'extracted_text',
    'readable_text',
    'document_text',
    'ui_text',
  ] as const
  for (const k of directKeys) {
    const v = data[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const analysis = data.analysis
  if (analysis && typeof analysis === 'object') {
    const nested = pickVisibleText(analysis as Record<string, unknown>)
    if (nested) return nested
  }
  return null
}

const EMPTY_CONTEXT: VisionContext = {
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

const POLL_INTERVAL_MS = 3000
/** Keep in sync with context polls so scene text refreshes instead of sitting stale for minutes. */
const ANALYSIS_INTERVAL_MS = 3000

/** Substring matched against the OS camera name (e.g. eMeet). Override with `VITE_VISION_CAMERA_LABEL` in `.env`. */
function visionCameraHeader(): Record<string, string> {
  const raw = import.meta.env.VITE_VISION_CAMERA_LABEL
  const label = typeof raw === 'string' && raw.trim() ? raw.trim() : 'emeet'
  return { 'X-Jarvis-Camera-Label': label }
}

export function useVision(active: boolean) {
  const [context, setContext] = useState<VisionContext>(EMPTY_CONTEXT)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const triggerAnalysis = useCallback(async () => {
    try {
      await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...visionCameraHeader() },
        /** Jarvis Visual Engine may honor these; unknown fields are typically ignored. */
        body: JSON.stringify({
          include_visible_text: true,
          extract_readable_text: true,
          analysis_focus: 'scene_objects_and_readable_text',
        }),
      })
    } catch {
      /* vision engine may be offline */
    }
  }, [])

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch('/api/vision/context', { headers: visionCameraHeader() })
      if (!res.ok) {
        setContext((prev) => ({ ...prev, connected: false }))
        return
      }
      const data = (await res.json()) as Record<string, unknown>

      const sceneRaw = data.scene_description ?? data.analysis
      const sceneDescription =
        typeof sceneRaw === 'string'
          ? sceneRaw
          : sceneRaw && typeof sceneRaw === 'object' && 'description' in sceneRaw && typeof (sceneRaw as { description?: unknown }).description === 'string'
            ? (sceneRaw as { description: string }).description
            : typeof sceneRaw === 'object' && sceneRaw !== null && 'text' in sceneRaw && typeof (sceneRaw as { text?: unknown }).text === 'string'
              ? (sceneRaw as { text: string }).text
              : null

      const visibleFromTop = pickVisibleText(data)
      const visibleFromScene =
        typeof sceneRaw === 'object' && sceneRaw !== null
          ? pickVisibleText(sceneRaw as Record<string, unknown>)
          : null

      const svcUp = (data.connected as boolean | undefined) ?? true
      const explicitCam = data.camera_connected as boolean | undefined
      const inferredCam = inferCameraActiveFromPayload(data)
      /** Service must be up; then accept explicit OK, inferred signals, or unknown camera flag (engine often omits camera_connected). */
      const cameraConnected =
        svcUp &&
        (inferredCam || explicitCam === true || explicitCam !== false)

      setContext({
        connected: svcUp,
        cameraConnected,
        faces: Array.isArray(data.faces) ? (data.faces as VisionFace[]) : [],
        sceneDescription,
        visibleText: visibleFromTop ?? visibleFromScene,
        emotion: (data.emotion as VisionEmotion | null) ?? null,
        framesProcessed: (data.frames_processed as number | undefined) ?? (data.stats as { frames_processed?: number } | undefined)?.frames_processed ?? 0,
        facesRecognized: (data.faces_recognized as number | undefined) ?? (data.stats as { faces_recognized?: number } | undefined)?.faces_recognized ?? 0,
        motionDetections: (data.motion_detections as number | undefined) ?? (data.stats as { motion_detections?: number } | undefined)?.motion_detections ?? 0,
        apiCalls: (data.api_calls as number | undefined) ?? (data.stats as { api_calls?: number } | undefined)?.api_calls ?? 0,
        lastUpdated: (data.last_updated as string | undefined) ?? (data.timestamp as string | undefined) ?? new Date().toISOString(),
      })
    } catch {
      setContext((prev) => ({ ...prev, connected: false }))
    }
  }, [])

  useEffect(() => {
    if (!active) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current)
      pollTimerRef.current = null
      analysisTimerRef.current = null
      setContext(EMPTY_CONTEXT)
      return
    }

    triggerAnalysis()
    fetchContext()

    pollTimerRef.current = setInterval(fetchContext, POLL_INTERVAL_MS)
    analysisTimerRef.current = setInterval(triggerAnalysis, ANALYSIS_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current)
      pollTimerRef.current = null
      analysisTimerRef.current = null
    }
  }, [active, fetchContext, triggerAnalysis])

  return { context, triggerAnalysis }
}
