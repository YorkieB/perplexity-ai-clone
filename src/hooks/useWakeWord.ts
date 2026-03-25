import { useEffect, useRef, useState, useCallback } from 'react'

export interface UseWakeWordOptions {
  readonly enabled: boolean
  readonly onWake: () => void
  readonly phrase?: string
  /** Min silence duration (ms) after speech to trigger transcription. */
  readonly silenceMs?: number
}

export interface UseWakeWordReturn {
  readonly isListening: boolean
  readonly isSupported: boolean
}

const ENERGY_THRESHOLD = 12
const ANALYSER_FFT = 512
const CHECK_INTERVAL_MS = 100

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // NOSONAR
    .replace(/\s+/g, ' ') // NOSONAR
    .trim()
}

function containsPhrase(transcript: string, phrase: string): boolean {
  return normalise(transcript).includes(normalise(phrase))
}

async function transcribeClip(
  blob: Blob,
  phrase: string,
  cooldownRef: React.RefObject<boolean>,
  onWakeRef: React.RefObject<() => void>,
) {
  if (cooldownRef.current) return
  try {
    const form = new FormData()
    form.append('file', blob, 'wake.webm')
    form.append('model', 'whisper-1')
    const res = await fetch('/api/wake-word', { method: 'POST', body: form })
    if (!res.ok) return
    const data = (await res.json()) as { text?: string }
    if (data.text && containsPhrase(data.text, phrase)) {
      cooldownRef.current = true
      onWakeRef.current()
      setTimeout(() => { cooldownRef.current = true; cooldownRef.current = false }, 3000) // NOSONAR
    }
  } catch { /* transcription failed — silently retry next cycle */ }
}

function computeEnergy(analyser: AnalyserNode, freqData: Uint8Array): number {
  analyser.getByteFrequencyData(freqData)
  let sum = 0
  for (const val of freqData) sum += val
  return sum / freqData.length
}

/**
 * Wake word detection using mic capture + energy-based VAD + OpenAI Whisper.
 * Works reliably in Electron (unlike Web Speech API which needs Chrome's backend).
 */
export function useWakeWord(opts: UseWakeWordOptions): UseWakeWordReturn {
  const { enabled, onWake, phrase = 'hey jarvis', silenceMs = 1200 } = opts
  const isSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const [isListening, setIsListening] = useState(false)
  const onWakeRef = useRef(onWake)
  const cooldownRef = useRef(false)

  useEffect(() => {
    onWakeRef.current = onWake
  }, [onWake])

  const stop = useCallback(() => setIsListening(false), [])

  useEffect(() => {
    if (!enabled || !isSupported) {
      stop()
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let audioCtx: AudioContext | null = null
    let recorder: MediaRecorder | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let isRecording = false
    let chunks: Blob[] = []

    function handleRecordingStop(mimeType: string) {
      if (cancelled || chunks.length === 0) {
        chunks = []
        return
      }
      const blob = new Blob(chunks, { type: mimeType })
      chunks = []
      void transcribeClip(blob, phrase, cooldownRef, onWakeRef)
    }

    function endRecording() {
      if (isRecording && recorder?.state === 'recording') {
        isRecording = false
        recorder.stop()
      }
      silenceTimer = null
    }

    function checkEnergy(analyser: AnalyserNode, freqData: Uint8Array) {
      if (cancelled) return
      const avg = computeEnergy(analyser, freqData)

      if (avg > ENERGY_THRESHOLD) {
        if (!isRecording && recorder?.state === 'inactive') {
          isRecording = true
          chunks = []
          recorder.start(250)
        }
        if (silenceTimer) {
          clearTimeout(silenceTimer)
          silenceTimer = null
        }
      } else if (isRecording) {
        silenceTimer ??= setTimeout(endRecording, silenceMs) // NOSONAR
      }
    }

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        })
      } catch {
        console.warn('[useWakeWord] Mic access denied')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = ANALYSER_FFT
      source.connect(analyser)
      const freqData = new Uint8Array(analyser.frequencyBinCount)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => handleRecordingStop(mimeType)

      intervalId = setInterval(() => checkEnergy(analyser, freqData), CHECK_INTERVAL_MS)
      if (!cancelled) setIsListening(true)
    }

    void init()

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (silenceTimer) clearTimeout(silenceTimer)
      if (recorder?.state === 'recording') {
        try { recorder.stop() } catch { /* cleanup */ }
      }
      if (audioCtx) {
        void audioCtx.close().catch(() => {})
      }
      if (stream) stream.getTracks().forEach((t) => t.stop())
      setIsListening(false)
    }
  }, [enabled, phrase, silenceMs, isSupported, stop])

  return { isListening, isSupported }
}
