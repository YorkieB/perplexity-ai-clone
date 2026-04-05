import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition'
import {
  synthesizeSpeechChunk,
  playAudioBuffer,
  stopAllAudio,
  speakWithBrowserTTS,
  stopBrowserTTS,
} from '@/lib/tts'
import { callLlmStream } from '@/lib/llm'
import { FocusMode } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoicePipelineState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface UseVoicePipelineOptions {
  onResponse?: (userText: string, aiText: string) => void
  focusMode?: FocusMode
  model?: string
}

export interface UseVoicePipelineReturn {
  state: VoicePipelineState
  transcript: string
  interimTranscript: string
  aiText: string
  isSupported: boolean
  errorMessage: string | null
  open: () => void
  close: () => void
  bargeIn: () => void
}

// ─── Chunk splitter (latency-optimised) ───────────────────────────────────────

const CLAUSE_BREAK = /(?<=[.!?…;:,–—])\s+/
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[A-Z"'(\d])/
const MAX_CHUNK_CHARS = 90
const FORCE_FLUSH_CHARS = 160

function extractChunks(buffer: string): [string[], string] {
  if (buffer.length >= FORCE_FLUSH_CHARS) {
    const idx = buffer.lastIndexOf(' ', FORCE_FLUSH_CHARS)
    if (idx > 20) {
      return [[buffer.slice(0, idx).trim()], buffer.slice(idx).trim()]
    }
    return [[buffer.trim()], '']
  }

  const sentenceParts = buffer.split(SENTENCE_BREAK)
  if (sentenceParts.length > 1) {
    const chunks = sentenceParts.slice(0, -1).map((s) => s.trim()).filter(Boolean)
    return [chunks, sentenceParts[sentenceParts.length - 1]]
  }

  if (buffer.length >= MAX_CHUNK_CHARS) {
    const clauseParts = buffer.split(CLAUSE_BREAK)
    if (clauseParts.length > 1) {
      const chunks = clauseParts.slice(0, -1).map((s) => s.trim()).filter(Boolean)
      return [chunks, clauseParts[clauseParts.length - 1]]
    }
  }

  return [[], buffer]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoicePipeline(options: UseVoicePipelineOptions = {}): UseVoicePipelineReturn {
  const { onResponse, focusMode = 'all', model = 'gpt-4o-mini' } = options

  const [state, setState] = useState<VoicePipelineState>('idle')
  const [aiText, setAiText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const sentenceBufferRef = useRef('')
  const usingBrowserTTSRef = useRef(false)
  const aiTextAccRef = useRef('')
  const ttsQueueRef = useRef<Array<Promise<{ buffer: AudioBuffer | null; text: string }>>>([])
  const drainActiveRef = useRef(false)
  const isOpenRef = useRef(false)
  const userTranscriptRef = useRef('')

  // ── Barge-in ──────────────────────────────────────────────────────────────

  const bargeIn = useCallback(() => {
    if (state !== 'speaking' && state !== 'thinking') return

    abortRef.current?.abort()
    abortRef.current = null
    stopAllAudio()
    stopBrowserTTS()

    drainActiveRef.current = false
    ttsQueueRef.current = []
    sentenceBufferRef.current = ''
    usingBrowserTTSRef.current = false

    setState('listening')
  }, [state])

  // ── Speech recognition callbacks ──────────────────────────────────────────

  const handleSpeechStart = useCallback(() => {
    if (isOpenRef.current && (state === 'speaking' || state === 'thinking')) {
      bargeIn()
    }
  }, [state, bargeIn])

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      if (!isOpenRef.current || state === 'thinking' || state === 'speaking') return
      if (!text.trim()) return

      userTranscriptRef.current = text.trim()
      aiTextAccRef.current = ''
      setAiText('')
      setErrorMessage(null)
      setState('thinking')

      stt.stop()

      const abort = new AbortController()
      abortRef.current = abort

      try {
        const prompt = `You are a helpful AI voice assistant. Keep responses concise and conversational — aim for 2-4 sentences unless detail is truly needed. Do not use markdown, bullet points, or headers in your response; speak in plain natural language.\n\nUser: ${text}\n\nAnswer from your knowledge.`

        sentenceBufferRef.current = ''
        ttsQueueRef.current = []
        drainActiveRef.current = true

        drainTTSQueue(abort.signal)

        for await (const delta of callLlmStream(prompt, model, abort.signal)) {
          if (abort.signal.aborted) break
          const chunk = delta.content ?? ''
          aiTextAccRef.current += chunk
          setAiText(aiTextAccRef.current)
          sentenceBufferRef.current += chunk

          const [chunks, remainder] = extractChunks(sentenceBufferRef.current)
          sentenceBufferRef.current = remainder

          for (const c of chunks) {
            enqueueSentence(c, abort.signal)
          }
        }

        if (!abort.signal.aborted && sentenceBufferRef.current.trim()) {
          enqueueSentence(sentenceBufferRef.current.trim(), abort.signal)
          sentenceBufferRef.current = ''
        }

        if (!abort.signal.aborted) {
          onResponse?.(userTranscriptRef.current, aiTextAccRef.current)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('[VoicePipeline] error:', err)
        setErrorMessage('Something went wrong. Please try again.')
        setState('listening')
        stt.start()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, focusMode, model, onResponse]
  )

  // ── TTS queue helpers ─────────────────────────────────────────────────────

  function enqueueSentence(text: string, signal: AbortSignal) {
    const promise = synthesizeSpeechChunk(text, signal, 'alloy', 'tts-1', 1.1)
      .then((buffer) => ({ buffer, text }))
      .catch(() => {
        usingBrowserTTSRef.current = true
        return { buffer: null, text }
      })

    ttsQueueRef.current.push(promise)
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- TTS drain loop coordinates abort, buffering, audio/browser-TTS fallback, and silence padding
  async function drainTTSQueue(signal: AbortSignal) {
    while (drainActiveRef.current) {
      if (signal.aborted) return

      if (ttsQueueRef.current.length === 0) {
        await sleep(20)
        continue
      }

      const itemPromise = ttsQueueRef.current.shift()!
      const item = await itemPromise

      if (signal.aborted || !drainActiveRef.current) return

      setState('speaking')

      if (item.buffer) {
        await new Promise<void>((resolve) => {
          playAudioBuffer(item.buffer!, resolve)
        })
      } else {
        try {
          await speakWithBrowserTTS(item.text, signal)
        } catch {
          // Aborted or unsupported
        }
      }

      if (signal.aborted || !drainActiveRef.current) return
    }

    if (!signal.aborted && isOpenRef.current) {
      setState('listening')
      stt.start()
    }
  }

  // ── STT hook ──────────────────────────────────────────────────────────────

  const stt = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    onSpeechStart: handleSpeechStart,
  })

  // ── Public API ────────────────────────────────────────────────────────────

  const open = useCallback(() => {
    if (!stt.isSupported) {
      setErrorMessage('Voice requires microphone access and MediaRecorder support.')
      return
    }
    isOpenRef.current = true
    setErrorMessage(null)
    setAiText('')
    aiTextAccRef.current = ''
    setState('listening')
    stt.start()
  }, [stt])

  const close = useCallback(() => {
    isOpenRef.current = false
    drainActiveRef.current = false

    abortRef.current?.abort()
    abortRef.current = null

    stopAllAudio()
    stopBrowserTTS()
    ttsQueueRef.current = []
    sentenceBufferRef.current = ''

    stt.stop()
    stt.reset()
    setAiText('')
    aiTextAccRef.current = ''
    setErrorMessage(null)
    setState('idle')
  }, [stt])

  useEffect(() => {
    return () => {
      isOpenRef.current = false
      drainActiveRef.current = false
      abortRef.current?.abort()
      stopAllAudio()
      stopBrowserTTS()
    }
  }, [])

  return {
    state,
    transcript: stt.transcript,
    interimTranscript: stt.interimTranscript,
    aiText,
    isSupported: stt.isSupported,
    errorMessage,
    open,
    close,
    bargeIn,
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
