/**
 * Text-to-speech utilities for the voice pipeline.
 *
 * Primary:  POST /api/tts → OpenAI audio/speech → AudioContext playback
 * Fallback: window.speechSynthesis when the API call fails
 *
 * The module keeps a singleton AudioContext and an active-source registry so
 * stopAllAudio() can cancel everything immediately (barge-in support).
 */

let _ctx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext()
  }
  return _ctx
}

/** All currently-playing source nodes, so we can stop them on barge-in. */
const _activeSources = new Set<AudioBufferSourceNode>()

/**
 * Call OpenAI TTS via the Vite proxy and decode the audio into an AudioBuffer.
 * Throws if the network request fails (caller should fall back to speechSynthesis).
 */
export async function synthesizeSpeechChunk(
  text: string,
  signal?: AbortSignal,
  voice: string = 'alloy',
  model: string = 'tts-1',
  speed: number = 1.0
): Promise<AudioBuffer> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ model, input: text, voice, speed }),
  })

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText)
    throw new Error(`TTS request failed: ${response.status} — ${msg}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const ctx = getAudioContext()
  return ctx.decodeAudioData(arrayBuffer)
}

/**
 * Play an AudioBuffer immediately.
 * Returns the source node so the caller can track it if needed.
 * The node is automatically removed from _activeSources when playback ends.
 */
export function playAudioBuffer(
  buffer: AudioBuffer,
  onEnded?: () => void
): AudioBufferSourceNode {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    ctx.resume()
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)

  _activeSources.add(source)
  source.onended = () => {
    _activeSources.delete(source)
    onEnded?.()
  }

  source.start(0)
  return source
}

/**
 * Immediately stop all in-progress audio playback.
 * Call this on barge-in before re-entering listening mode.
 */
export function stopAllAudio() {
  for (const source of _activeSources) {
    try {
      source.stop()
    } catch {
      // already stopped
    }
  }
  _activeSources.clear()
}

/**
 * Web Speech Synthesis fallback — speaks text using the browser's built-in TTS.
 * Returns a Promise that resolves when speech ends or rejects on error.
 */
export function speakWithBrowserTTS(
  text: string,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('speechSynthesis not supported'))
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(new Error(e.error))

    const cancelOnAbort = () => {
      window.speechSynthesis.cancel()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', cancelOnAbort, { once: true })
    utterance.onend = () => {
      signal?.removeEventListener('abort', cancelOnAbort)
      resolve()
    }

    window.speechSynthesis.speak(utterance)
  })
}

/**
 * Stop browser speech synthesis (fallback barge-in).
 */
export function stopBrowserTTS() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

// ─── Desktop-compat helpers (used by VoiceConversationModal, MessageActionToolbar) ─

const PREFERRED_TTS_VOICE_KEY = 'preferred-tts-voice'

const OPENAI_VOICES: Record<string, string> = {
  alloy: 'Alloy',
  echo: 'Echo',
  fable: 'Fable',
  onyx: 'Onyx',
  nova: 'Nova',
  shimmer: 'Shimmer',
}

export const OPENAI_TTS_VOICE_OPTIONS = Object.entries(OPENAI_VOICES).map(
  ([id, label]) => ({ id, label })
)

export function getEffectiveTtsVoice(): string {
  try {
    return localStorage.getItem(PREFERRED_TTS_VOICE_KEY)?.trim() || 'alloy'
  } catch {
    return 'alloy'
  }
}

export function getEffectiveTtsVoiceLabel(): string {
  const voice = getEffectiveTtsVoice()
  return OPENAI_VOICES[voice] ?? voice
}

export function playTts(
  text: string,
  opts?: { signal?: AbortSignal; voice?: string }
): { done: Promise<void>; cancel: () => void } {
  const ac = new AbortController()
  const signal = opts?.signal

  signal?.addEventListener('abort', () => ac.abort(), { once: true })

  const done = (async () => {
    try {
      const buf = await synthesizeSpeechChunk(text, ac.signal, opts?.voice)
      await new Promise<void>((resolve) => {
        const src = playAudioBuffer(buf, resolve)
        ac.signal.addEventListener('abort', () => {
          try {
            src.stop()
          } catch {
            /* already stopped */
          }
          _activeSources.delete(src)
          resolve()
        }, { once: true })
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      await speakWithBrowserTTS(text, ac.signal).catch(() => {})
    }
  })()

  return { done, cancel: () => ac.abort() }
}
