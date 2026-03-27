import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * MediaRecorder + OpenAI Whisper replacement for the Web Speech API.
 *
 * Works in Electron (where Web Speech API is unavailable) because it only
 * depends on getUserMedia + MediaRecorder, both of which Chromium supports.
 *
 * Flow:
 *   start() → acquire mic → record continuously
 *   VAD detects speech-start → fire onSpeechStart
 *   VAD detects silence (after speech) → send recording to /api/stt (Whisper)
 *   onFinalTranscript fires with transcription → restart recording
 */

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'error' | 'unsupported'

export interface UseSpeechRecognitionReturn {
  status: SpeechRecognitionStatus
  transcript: string
  interimTranscript: string
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  reset: () => void
  errorMessage: string | null
}

const SPEECH_THRESHOLD = 0.012
const SILENCE_DURATION_MS = 800

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return 'audio/webm'
}

function mimeToExt(mime: string): string {
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  return 'webm'
}

async function transcribeAudio(blob: Blob, lang: string): Promise<string> {
  const mime = blob.type || 'audio/webm'
  const ext = mimeToExt(mime)
  const formData = new FormData()
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-1')
  const langCode = lang.split('-')[0]
  if (langCode) formData.append('language', langCode)

  const res = await fetch('/api/stt', { method: 'POST', body: formData })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`STT failed: ${res.status} — ${text}`)
  }
  const json = await res.json()
  return json.text || ''
}

export function useSpeechRecognition(options: {
  onFinalTranscript?: (text: string) => void
  onSpeechStart?: () => void
  lang?: string
}): UseSpeechRecognitionReturn {
  const { onFinalTranscript, onSpeechStart, lang = 'en-US' } = options

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wantListening = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const isSpeakingRef = useRef(false)
  const silenceStartRef = useRef<number>(0)
  const chunksRef = useRef<Blob[]>([])
  const busyRef = useRef(false)
  const mimeRef = useRef(getSupportedMimeType())

  const onFinalRef = useRef(onFinalTranscript)
  const onSpeechStartRef = useRef(onSpeechStart)
  useEffect(() => { onFinalRef.current = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onSpeechStartRef.current = onSpeechStart }, [onSpeechStart])

  const beginRecording = useCallback(() => {
    if (!streamRef.current || !streamRef.current.active) return
    chunksRef.current = []
    try {
      const rec = new MediaRecorder(streamRef.current, { mimeType: mimeRef.current })
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.start(250)
      recorderRef.current = rec
    } catch (err) {
      console.error('[STT] MediaRecorder failed to start:', err)
    }
  }, [])

  const transcribeAndReport = useCallback(async (blob: Blob) => {
    setInterimTranscript('Transcribing…')
    try {
      const text = await transcribeAudio(blob, lang)
      if (text.trim()) {
        setTranscript((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()))
        onFinalRef.current?.(text.trim())
      }
    } catch (err) {
      console.error('[STT] Whisper error:', err)
    } finally {
      setInterimTranscript('')
      busyRef.current = false
    }
  }, [lang])

  const handleEndOfSpeech = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive' || busyRef.current) return

    busyRef.current = true
    isSpeakingRef.current = false

    const rec = recorderRef.current
    recorderRef.current = null

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      chunksRef.current = []

      if (blob.size > 0) {
        transcribeAndReport(blob)
      } else {
        busyRef.current = false
      }

      if (wantListening.current) beginRecording()
    }

    try { rec.stop() } catch { busyRef.current = false }
  }, [beginRecording, transcribeAndReport])

  const monitorAudio = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || !wantListening.current) return

    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)

    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)

    const now = Date.now()

    if (rms > SPEECH_THRESHOLD) {
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true
        onSpeechStartRef.current?.()
        setInterimTranscript('Listening…')
      }
      silenceStartRef.current = now
    } else if (isSpeakingRef.current) {
      if (!silenceStartRef.current) silenceStartRef.current = now
      if (now - silenceStartRef.current > SILENCE_DURATION_MS && !busyRef.current) {
        handleEndOfSpeech()
      }
    }

    rafRef.current = requestAnimationFrame(monitorAudio)
  }, [handleEndOfSpeech])

  const releaseMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignored */ }
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => { /* ignored */ })
    }
    audioCtxRef.current = null
    analyserRef.current = null
    chunksRef.current = []
    isSpeakingRef.current = false
    busyRef.current = false
  }, [])

  const start = useCallback(async () => {
    setErrorMessage(null)
    setTranscript('')
    setInterimTranscript('')
    wantListening.current = true

    if (!streamRef.current || !streamRef.current.active) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        streamRef.current = stream

        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        source.connect(analyser)
        analyserRef.current = analyser
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Microphone access denied'
        setErrorMessage(msg)
        setStatus('error')
        wantListening.current = false
        return
      }
    }

    beginRecording()
    setStatus('listening')
    rafRef.current = requestAnimationFrame(monitorAudio)
  }, [beginRecording, monitorAudio])

  const stop = useCallback(() => {
    wantListening.current = false
    cancelAnimationFrame(rafRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignored */ }
    }
    recorderRef.current = null
    chunksRef.current = []
    isSpeakingRef.current = false
    busyRef.current = false
    setStatus('idle')
    setInterimTranscript('')
  }, [])

  const reset = useCallback(() => {
    stop()
    releaseMic()
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
  }, [stop, releaseMic])

  useEffect(() => {
    return () => {
      wantListening.current = false
      releaseMic()
    }
  }, [releaseMic])

  return {
    status,
    transcript,
    interimTranscript,
    isListening: status === 'listening',
    isSupported:
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined',
    start,
    stop,
    reset,
    errorMessage,
  }
}
