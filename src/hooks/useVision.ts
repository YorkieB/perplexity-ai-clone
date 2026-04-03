import { useState, useEffect, useRef, useCallback } from 'react'
import { getVisionCameraLabelHeaders } from '@/lib/vision-camera-label'

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
/** Nested envelopes some vision engines use (`data`, `result`, …). */
function nestedVisionRecord(data: Record<string, unknown>): Record<string, unknown> | null {
  for (const k of ['data', 'result', 'payload', 'context'] as const) {
    const v = data[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  }
  return null
}

/**
 * First non-empty scene source from engine JSON (top-level + nested).
 * Exported for voice session bootstrap — must match {@link visionContextFromEnginePayload}.
 */
export function pickSceneRawFromPayload(data: Record<string, unknown>): unknown {
  const nested = nestedVisionRecord(data)
  const candidates: unknown[] = [
    data.scene_description,
    data.scene_summary,
    data.room_description,
    typeof data.description === 'string' ? data.description : undefined,
    data.analysis,
    typeof data.scene === 'string' ? data.scene : undefined,
  ]
  if (nested) {
    candidates.push(
      nested.scene_description,
      nested.scene_summary,
      nested.room_description,
      typeof nested.description === 'string' ? nested.description : undefined,
      nested.analysis,
      typeof nested.scene === 'string' ? nested.scene : undefined,
    )
  }
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c
  }
  return undefined
}

function normalizeEmotionFromPayload(raw: unknown): VisionEmotion | null {
  if (raw == null) return null
  if (typeof raw === 'string' && raw.trim()) {
    return { primary: raw.trim().slice(0, 80), confidence: 0.5 }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const primaryRaw = o.primary ?? o.label ?? o.dominant ?? o.mood
  if (typeof primaryRaw !== 'string' || !primaryRaw.trim()) return null
  let conf = 0.5
  const c = o.confidence ?? o.score
  if (typeof c === 'number' && !Number.isNaN(c)) {
    conf = c > 1 ? Math.min(1, c / 100) : Math.max(0, Math.min(1, c))
  }
  const out: VisionEmotion = { primary: primaryRaw.trim().slice(0, 80), confidence: conf }
  const sec = o.secondary
  if (typeof sec === 'string' && sec.trim()) out.secondary = sec.trim().slice(0, 80)
  return out
}

function inferCameraActiveFromPayload(data: Record<string, unknown>): boolean {
  const frames =
    (data.frames_processed as number | undefined) ??
    (data.stats as { frames_processed?: number } | undefined)?.frames_processed ??
    0
  if (frames > 0) return true

  const sceneRaw = pickSceneRawFromPayload(data)
  const sceneStr =
    typeof sceneRaw === 'string'
      ? sceneRaw
      : sceneRaw && typeof sceneRaw === 'object' && 'description' in sceneRaw && typeof (sceneRaw as { description?: unknown }).description === 'string'
        ? (sceneRaw as { description: string }).description
        : ''
  if (sceneStr.trim().length > 0) return true

  if (pickVisibleText(data)) return true
  const nestedForInfer = nestedVisionRecord(data)
  if (nestedForInfer && pickVisibleText(nestedForInfer)) return true
  if (Array.isArray(data.faces) && data.faces.length > 0) return true
  if (nestedForInfer && Array.isArray(nestedForInfer.faces) && nestedForInfer.faces.length > 0) return true
  if (data.emotion != null) return true
  if (nestedForInfer?.emotion != null) return true
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

/**
 * Maps a `/api/vision/context` JSON body to {@link VisionContext}.
 * Used by {@link useVision} polling and by voice Realtime bootstrap so the first
 * [VISUAL CONTEXT UPDATE] matches the same HTTP response (React state can lag by a poll interval).
 */
export function visionContextFromEnginePayload(data: Record<string, unknown>): VisionContext {
  const sceneRaw = pickSceneRawFromPayload(data)
  const sceneDescription =
    typeof sceneRaw === 'string'
      ? sceneRaw
      : sceneRaw && typeof sceneRaw === 'object' && 'description' in sceneRaw && typeof (sceneRaw as { description?: unknown }).description === 'string'
        ? (sceneRaw as { description: string }).description
        : typeof sceneRaw === 'object' && sceneRaw !== null && 'text' in sceneRaw && typeof (sceneRaw as { text?: unknown }).text === 'string'
          ? (sceneRaw as { text: string }).text
          : null

  const nested = nestedVisionRecord(data)
  const visibleFromTop = pickVisibleText(data) ?? (nested ? pickVisibleText(nested) : null)
  const visibleFromScene =
    typeof sceneRaw === 'object' && sceneRaw !== null
      ? pickVisibleText(sceneRaw as Record<string, unknown>)
      : null

  const emotionRaw = data.emotion ?? nested?.emotion
  const emotion = normalizeEmotionFromPayload(emotionRaw)

  const stats = (data.stats as { frames_processed?: number } | undefined) ?? (nested?.stats as { frames_processed?: number } | undefined)

  const svcUp = (data.connected as boolean | undefined) ?? true
  const explicitCam = data.camera_connected as boolean | undefined
  const inferredCam = inferCameraActiveFromPayload(data)
  /** True when we have any grounded pixels/text for the LLM (faces, frames, scene copy, OCR). */
  const hasRenderableScene =
    Boolean(sceneDescription?.trim()) ||
    Boolean(visibleFromTop ?? visibleFromScene) ||
    (Array.isArray(data.faces) && data.faces.length > 0) ||
    (nested && Array.isArray(nested.faces) && nested.faces.length > 0) ||
    emotion != null ||
    ((data.frames_processed as number | undefined) ?? stats?.frames_processed ?? 0) > 0
  /**
   * If the engine sets `camera_connected: false` but still returns scene/error text or frame stats,
   * keep "camera path" true for prompts so the model does not deny vision while describing the payload.
   */
  const cameraConnected =
    svcUp && (explicitCam === true || explicitCam === undefined || inferredCam || hasRenderableScene)

  const facesRec =
    (data.faces_recognized as number | undefined) ??
    (nested?.faces_recognized as number | undefined) ??
    (stats as { faces_recognized?: number } | undefined)?.faces_recognized ??
    0
  const motionDet =
    (data.motion_detections as number | undefined) ??
    (nested?.motion_detections as number | undefined) ??
    (stats as { motion_detections?: number } | undefined)?.motion_detections ??
    0

  return {
    connected: svcUp,
    cameraConnected,
    faces: Array.isArray(data.faces) ? (data.faces as VisionFace[]) : nested && Array.isArray(nested.faces) ? (nested.faces as VisionFace[]) : [],
    sceneDescription,
    visibleText: visibleFromTop ?? visibleFromScene,
    emotion,
    framesProcessed: (data.frames_processed as number | undefined) ?? stats?.frames_processed ?? 0,
    facesRecognized: facesRec,
    motionDetections: motionDet,
    apiCalls: (data.api_calls as number | undefined) ?? (nested?.api_calls as number | undefined) ?? 0,
    lastUpdated: (data.last_updated as string | undefined) ?? (data.timestamp as string | undefined) ?? new Date().toISOString(),
  }
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
/** Extra polls after activation so vision connects soon after app + engine cold start (e.g. eMeet + spawned Python). */
const STARTUP_WARMUP_DELAYS_MS = [450, 1100, 2200, 4000, 7000, 12000] as const

export function useVision(active: boolean) {
  const [context, setContext] = useState<VisionContext>(EMPTY_CONTEXT)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const triggerAnalysis = useCallback(async () => {
    try {
      await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getVisionCameraLabelHeaders() },
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
      const res = await fetch('/api/vision/context', { headers: getVisionCameraLabelHeaders() })
      if (!res.ok) {
        setContext((prev) => ({ ...prev, connected: false }))
        return
      }
      const data = (await res.json()) as Record<string, unknown>
      setContext(visionContextFromEnginePayload(data))
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

    const warmupIds: number[] = []
    for (const ms of STARTUP_WARMUP_DELAYS_MS) {
      warmupIds.push(
        window.setTimeout(() => {
          void triggerAnalysis()
          void fetchContext()
        }, ms),
      )
    }

    pollTimerRef.current = setInterval(fetchContext, POLL_INTERVAL_MS)
    analysisTimerRef.current = setInterval(triggerAnalysis, ANALYSIS_INTERVAL_MS)

    return () => {
      for (const id of warmupIds) window.clearTimeout(id)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current)
      pollTimerRef.current = null
      analysisTimerRef.current = null
    }
  }, [active, fetchContext, triggerAnalysis])

  return { context, triggerAnalysis }
}
