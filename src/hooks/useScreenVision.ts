import { useState, useEffect, useRef, useCallback } from 'react'

export interface ScreenVisionState {
  streaming: boolean
  stream: MediaStream | null
  error: string | null
}

/**
 * Live display capture for the Jarvis desktop shell. Requires user consent via getDisplayMedia;
 * main process can grant sources via `setDisplayMediaRequestHandler` (see jarvis-desktop-automation).
 */
export function useScreenVision() {
  const [state, setState] = useState<ScreenVisionState>({
    streaming: false,
    stream: null,
    error: null,
  })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080, frameRate: 15 },
        audio: false,
      })
      setState({ streaming: true, stream, error: null })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch (err) {
      setState({ streaming: false, stream: null, error: String(err) })
    }
  }, [])

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !state.streaming) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [state.streaming])

  const stopStream = useCallback(() => {
    setState((prev) => {
      prev.stream?.getTracks().forEach((t) => t.stop())
      return { streaming: false, stream: null, error: null }
    })
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

  return { ...state, videoRef, canvasRef, startStream, stopStream, captureFrame }
}
