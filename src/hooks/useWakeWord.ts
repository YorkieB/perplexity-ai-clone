import { useEffect, useRef, useState, useCallback } from 'react'

export interface UseWakeWordOptions {
  readonly enabled: boolean
  readonly onWake: () => void
  readonly phrase?: string
  readonly silenceMs?: number
}

export interface UseWakeWordReturn {
  readonly isListening: boolean
  readonly isSupported: boolean
}

const ENERGY_THRESHOLD = 10
const ANALYSER_FFT = 512
const CHECK_INTERVAL_MS = 100
const MAX_CLIP_DURATION_MS = 4000

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsPhrase(transcript: string, phrase: string): boolean {
  const norm = normalise(transcript)
  const normPhrase = normalise(phrase)
  if (norm.includes(normPhrase)) return true
  const words = normPhrase.split(' ')
  if (words.length > 1 && norm.includes(words[words.length - 1])) return true
  const fuzzyVariants = [
    'hey jarvis', 'jarvis', 'hey jervis', 'hey jarves',
    'a jarvis', 'hey jarbus', 'hey travis', 'hey service',
    'hey javis', 'jarvis please', 'ok jarvis', 'yo jarvis',
  ]
  return fuzzyVariants.some(v => norm.includes(v))
}

async function transcribeClip(
  blob: Blob,
  phrase: string,
  cooldownRef: React.MutableRefObject<boolean>,
  onWakeRef: React.MutableRefObject<() => void>,
) {
  if (cooldownRef.current) return
  if (blob.size < 1000) return
  try {
    const form = new FormData()
    form.append('file', blob, 'wake.webm')
    form.append('model', 'whisper-1')
    form.append('language', 'en')
    const res = await fetch('/api/wake-word', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn('[WakeWord] Transcription API error:', res.status, await res.text().catch(() => ''))
      return
    }
    const data = (await res.json()) as { text?: string }
    console.debug('[WakeWord] Heard:', data.text)
    if (data.text && containsPhrase(data.text, phrase)) {
      console.log('[WakeWord] Wake phrase detected!')
      cooldownRef.current = true
      onWakeRef.current()
      setTimeout(() => { cooldownRef.current = false }, 3000)
    }
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      console.warn('[WakeWord] Transcription error:', e.message)
    }
  }
}

function computeEnergy(analyser: AnalyserNode, freqData: Uint8Array): number {
  analyser.getByteFrequencyData(freqData)
  let sum = 0
  for (const val of freqData) sum += val
  return sum / freqData.length
}

/**
 * Wake word detection: mic capture → energy VAD → Whisper transcription → phrase match.
 */
export function useWakeWord(opts: UseWakeWordOptions): UseWakeWordReturn {
  const { enabled, onWake, phrase = 'hey jarvis', silenceMs = 1200 } = opts
  const isSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const [isListening, setIsListening] = useState(false)
  const onWakeRef = useRef(onWake)
  const cooldownRef = useRef(false)

  useEffect(() => { onWakeRef.current = onWake }, [onWake])

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
    let maxDurationTimer: ReturnType<typeof setTimeout> | null = null
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
      if (maxDurationTimer) { clearTimeout(maxDurationTimer); maxDurationTimer = null }
      if (isRecording && recorder?.state === 'recording') {
        isRecording = false
        try { recorder.stop() } catch { /* cleanup */ }
      }
      silenceTimer = null
    }

    function checkEnergy(analyser: AnalyserNode, freqData: Uint8Array) {
      if (cancelled) return
      const avg = computeEnergy(analyser, freqData)

      if (avg > ENERGY_THRESHOLD) {
        if (!isRecording && recorder && recorder.state === 'inactive') {
          isRecording = true
          chunks = []
          try {
            recorder.start(250)
            maxDurationTimer = setTimeout(endRecording, MAX_CLIP_DURATION_MS)
          } catch {
            isRecording = false
          }
        }
        if (silenceTimer) {
          clearTimeout(silenceTimer)
          silenceTimer = null
        }
      } else if (isRecording) {
        silenceTimer ??= setTimeout(endRecording, silenceMs)
      }
    }

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        })
      } catch (e) {
        console.warn('[WakeWord] Mic access denied:', e instanceof Error ? e.message : e)
        return
      }
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume() } catch { /* will retry below */ }
      }
      // Retry resume periodically if still suspended
      const resumeInterval = setInterval(() => {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {})
        } else {
          clearInterval(resumeInterval)
        }
      }, 1000)

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = ANALYSER_FFT
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      const freqData = new Uint8Array(analyser.frequencyBinCount)

      let mimeType = 'audio/ogg'
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
      }

      try {
        recorder = new MediaRecorder(stream, { mimeType })
      } catch {
        console.warn('[WakeWord] MediaRecorder creation failed, trying default')
        try {
          recorder = new MediaRecorder(stream)
        } catch (e2) {
          console.warn('[WakeWord] MediaRecorder not supported:', e2)
          return
        }
      }
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => handleRecordingStop(mimeType)

      intervalId = setInterval(() => checkEnergy(analyser, freqData), CHECK_INTERVAL_MS)
      if (!cancelled) {
        setIsListening(true)
        console.log('[WakeWord] Listening for "' + phrase + '"...')
      }
    }

    init().catch(() => {})

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (silenceTimer) clearTimeout(silenceTimer)
      if (maxDurationTimer) clearTimeout(maxDurationTimer)
      if (recorder?.state === 'recording') {
        try { recorder.stop() } catch { /* cleanup */ }
      }
      if (audioCtx) audioCtx.close().catch(() => {})
      if (stream) stream.getTracks().forEach(t => t.stop())
      setIsListening(false)
    }
  }, [enabled, phrase, silenceMs, isSupported, stop])

  return { isListening, isSupported }
}
