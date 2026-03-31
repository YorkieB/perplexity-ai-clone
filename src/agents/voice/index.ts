/**
 * Jarvis voice agent: listens on the shared emitter for `jarvis:speak` and plays via ElevenLabs PCM
 * (same upstream contract as the Electron `/api/elevenlabs-tts` proxy).
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'

import type EventEmitter from 'eventemitter3'

import { fetchElevenLabsPcm } from '@/lib/elevenlabs-tts-stream'

const SAMPLE_RATE = 24_000

export type JarvisSpeakPriority = 'low' | 'normal' | 'high'

export interface JarvisSpeakPayload {
  text: string
  priority: JarvisSpeakPriority
}

function pcm16MonoToWav(pcm: Buffer): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = numChannels * (bitsPerSample / 8)
  const byteRate = SAMPLE_RATE * blockAlign
  const dataSize = pcm.length
  const out = Buffer.alloc(44 + dataSize)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + dataSize, 4)
  out.write('WAVE', 8)
  out.write('fmt ', 12)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(numChannels, 22)
  out.writeUInt32LE(SAMPLE_RATE, 24)
  out.writeUInt32LE(byteRate, 28)
  out.writeUInt16LE(blockAlign, 32)
  out.writeUInt16LE(bitsPerSample, 34)
  out.write('data', 36)
  out.writeUInt32LE(dataSize, 40)
  pcm.copy(out, 44)
  return out
}

async function playPcmWithWebAudio(pcm: Buffer, signal: AbortSignal): Promise<void> {
  const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) {
    throw new Error('AudioContext not available')
  }
  const wav = pcm16MonoToWav(pcm)
  const ctx = new AC({ sampleRate: SAMPLE_RATE })
  const copy = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)
  const audioBuf = await ctx.decodeAudioData(copy)
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      void ctx.close().catch(() => {})
      resolve()
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = audioBuf
    src.connect(ctx.destination)
    const onAbort = (): void => {
      try {
        src.stop()
      } catch {
        /* ignored */
      }
      void ctx.close().catch(() => {})
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    src.onended = (): void => {
      signal.removeEventListener('abort', onAbort)
      void ctx.close().catch(() => {})
      resolve()
    }
    src.start(0)
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(reject)
    }
  })
}

function playWavWithPowerShell(wavPath: string): ChildProcess {
  const escaped = wavPath.replace(/'/g, "''")
  return spawn(
    'powershell.exe',
    ['-NoProfile', '-Command', `$sp = New-Object System.Media.SoundPlayer('${escaped}'); $sp.PlaySync()`],
    { stdio: 'ignore', windowsHide: true },
  )
}

function playWavWithFfplay(wavPath: string): ChildProcess {
  return spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-i', wavPath], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

function playWavWithAplay(wavPath: string): ChildProcess {
  return spawn('aplay', ['-q', wavPath], { stdio: 'ignore', windowsHide: true })
}

async function waitChild(child: ChildProcess, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignored */
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.on('error', (e) => {
      signal.removeEventListener('abort', onAbort)
      reject(e)
    })
    child.on('close', (code, sig) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) {
        resolve()
        return
      }
      if (code === 0 || sig === 'SIGTERM') {
        resolve()
        return
      }
      reject(new Error(`playback exited ${String(code)}`))
    })
  })
}

/** Prefer ffplay; fall back to ALSA `aplay` when ffplay is not installed. */
function spawnUnixPlayer(wavPath: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const ff = playWavWithFfplay(wavPath)
    ff.once('spawn', () => resolve(ff))
    ff.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') {
        reject(err)
        return
      }
      const ap = playWavWithAplay(wavPath)
      ap.once('spawn', () => resolve(ap))
      ap.once('error', reject)
    })
  })
}

async function playPcmNode(
  pcm: Buffer,
  signal: AbortSignal,
  hooks?: { onPlaybackChild?: (c: ChildProcess | null) => void },
): Promise<void> {
  const wav = pcm16MonoToWav(pcm)
  const path = join(tmpdir(), `jarvis-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`)
  await writeFile(path, wav)
  hooks?.onPlaybackChild?.(null)
  try {
    const child =
      platform() === 'win32' ? playWavWithPowerShell(path) : await spawnUnixPlayer(path)
    hooks?.onPlaybackChild?.(child)
    try {
      await waitChild(child, signal)
    } finally {
      hooks?.onPlaybackChild?.(null)
    }
  } finally {
    await unlink(path).catch(() => {})
  }
}

async function playPcm(
  pcm: Buffer,
  signal: AbortSignal,
  hooks?: { onPlaybackChild?: (c: ChildProcess | null) => void },
): Promise<void> {
  if (
    typeof globalThis.AudioContext !== 'undefined' ||
    typeof (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined'
  ) {
    await playPcmWithWebAudio(pcm, signal)
    return
  }
  await playPcmNode(pcm, signal, hooks)
}

export class VoiceAgent {
  private readonly emitter: EventEmitter
  private readonly onJarvisSpeak: (p: unknown) => void
  private started = false
  private readonly queue: string[] = []
  private drainRunning = false
  private currentAbort: AbortController | null = null
  private playbackChild: ChildProcess | null = null
  private lowTimer: ReturnType<typeof setTimeout> | null = null
  private pendingLow: string | null = null
  /** When true (e.g. Voice Mode open in renderer), skip ElevenLabs — avoids double voice with Realtime. */
  private playbackSuppressed = false

  constructor(emitter: EventEmitter) {
    this.emitter = emitter
    this.onJarvisSpeak = (raw: unknown): void => {
      const p = raw as Partial<JarvisSpeakPayload>
      const text = typeof p.text === 'string' ? p.text.trim() : ''
      const pr = p.priority
      if (!text || (pr !== 'low' && pr !== 'normal' && pr !== 'high')) {
        return
      }
      this.handleSpeak({ text, priority: pr })
    }
  }

  async initialize(): Promise<void> {
    if (this.started) {
      return
    }
    this.emitter.on('jarvis:speak', this.onJarvisSpeak)
    this.started = true
  }

  /** Suppress main-process TTS (e.g. while renderer Voice Mode is active). */
  setPlaybackSuppressed(suppress: boolean): void {
    this.playbackSuppressed = suppress
    if (suppress) {
      this.clearLowDebounce()
      this.queue.length = 0
      this.cancelOngoing()
    }
  }

  stop(): void {
    if (!this.started) {
      return
    }
    this.emitter.off('jarvis:speak', this.onJarvisSpeak)
    this.started = false
    this.clearLowDebounce()
    this.queue.length = 0
    this.cancelOngoing()
  }

  private clearLowDebounce(): void {
    if (this.lowTimer !== null) {
      clearTimeout(this.lowTimer)
      this.lowTimer = null
    }
    this.pendingLow = null
  }

  private cancelOngoing(): void {
    this.currentAbort?.abort()
    this.currentAbort = null
    if (this.playbackChild !== null) {
      try {
        this.playbackChild.kill('SIGTERM')
      } catch {
        /* ignored */
      }
      this.playbackChild = null
    }
  }

  private handleSpeak(p: JarvisSpeakPayload): void {
    if (this.playbackSuppressed) {
      return
    }
    if (p.priority === 'high') {
      this.clearLowDebounce()
      this.cancelOngoing()
      this.queue.unshift(p.text)
      void this.drain()
      return
    }
    if (p.priority === 'normal') {
      this.clearLowDebounce()
      this.queue.push(p.text)
      void this.drain()
      return
    }
    // low — debounce: only the latest text within 500ms is queued
    this.pendingLow = p.text
    if (this.lowTimer !== null) {
      clearTimeout(this.lowTimer)
    }
    this.lowTimer = setTimeout(() => {
      this.lowTimer = null
      const t = this.pendingLow
      this.pendingLow = null
      if (t && t.length > 0) {
        this.queue.push(t)
        void this.drain()
      }
    }, 500)
  }

  private async drain(): Promise<void> {
    if (this.drainRunning) {
      return
    }
    this.drainRunning = true
    try {
      while (this.started && this.queue.length > 0) {
        const text = this.queue.shift()!
        const ac = new AbortController()
        this.currentAbort = ac
        try {
          const pcm = await fetchElevenLabsPcm(text, { signal: ac.signal })
          await playPcm(pcm, ac.signal, {
            onPlaybackChild: (c) => {
              this.playbackChild = c
            },
          })
        } catch (e) {
          if (ac.signal.aborted) {
            continue
          }
          console.error('[VoiceAgent] speak failed:', e)
        } finally {
          if (this.currentAbort === ac) {
            this.currentAbort = null
          }
        }
      }
    } finally {
      this.drainRunning = false
    }
  }
}

export function createVoiceAgent(emitter: EventEmitter): VoiceAgent {
  return new VoiceAgent(emitter)
}
