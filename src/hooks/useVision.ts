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
  emotion: VisionEmotion | null
  framesProcessed: number
  facesRecognized: number
  motionDetections: number
  apiCalls: number
  lastUpdated: string | null
}

const EMPTY_CONTEXT: VisionContext = {
  connected: false,
  cameraConnected: false,
  faces: [],
  sceneDescription: null,
  emotion: null,
  framesProcessed: 0,
  facesRecognized: 0,
  motionDetections: 0,
  apiCalls: 0,
  lastUpdated: null,
}

const POLL_INTERVAL_MS = 3000
const ANALYSIS_INTERVAL_MS = 10_000

export function useVision(active: boolean) {
  const [context, setContext] = useState<VisionContext>(EMPTY_CONTEXT)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const triggerAnalysis = useCallback(async () => {
    try {
      await fetch('/api/vision/analyze', { method: 'POST' })
    } catch {
      /* vision engine may be offline */
    }
  }, [])

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch('/api/vision/context')
      if (!res.ok) {
        setContext((prev) => ({ ...prev, connected: false }))
        return
      }
      const data = await res.json()

      setContext({
        connected: data.connected ?? true,
        cameraConnected: data.camera_connected ?? false,
        faces: Array.isArray(data.faces) ? data.faces : [],
        sceneDescription: data.scene_description ?? data.analysis ?? null,
        emotion: data.emotion ?? null,
        framesProcessed: data.frames_processed ?? data.stats?.frames_processed ?? 0,
        facesRecognized: data.faces_recognized ?? data.stats?.faces_recognized ?? 0,
        motionDetections: data.motion_detections ?? data.stats?.motion_detections ?? 0,
        apiCalls: data.api_calls ?? data.stats?.api_calls ?? 0,
        lastUpdated: data.last_updated ?? data.timestamp ?? new Date().toISOString(),
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
