/**
 * Vonage Voice WebSocket bridge: inbound L16 PCM → STT → OpenAI chat → TTS PCM → outbound chunks.
 *
 * Tier 2 (when DEEPGRAM_API_KEY is set): Deepgram streaming STT (`listen.v1`), no Whisper batch timer.
 * Tier 1 fallback: Whisper batch + poll interval when Deepgram is unavailable.
 * Tier 3 (when ELEVENLABS_API_KEY is set): ElevenLabs `stream-input` WebSocket, pcm_16000 → Vonage (no 24k resample).
 * Tier 3 fallback: OpenAI `gpt-4o-mini-tts` PCM + resample to 16 kHz when ElevenLabs is unavailable or errors.
 * Tier 4 (default): OpenAI chat `stream: true` → sentence chunks → ElevenLabs multi-flush or OpenAI TTS per sentence (lower latency to first audio).
 * Set VONAGE_AI_STREAMING_LLM=0 to use batch chat + Tier 3 TTS only.
 * Tier 5 (HTTP, Electron/Vite): inbound Vonage webhooks — `VONAGE_SIGNATURE_SECRET` + `/api/vonage/webhook/answer|event` (see `scripts/vonage-webhook-verify.cjs`).
 *
 * Shared: state machine, barge-in (`clear` + AbortSignal), phrase cache, metrics, WS cleanup.
 *
 * Must be reachable at wss://… (e.g. ngrok) — set VONAGE_PUBLIC_WS_URL for AI calls.
 *
 * Start: VONAGE_AI_VOICE_BRIDGE_ENABLED=1 (Electron) or: node electron/vonage-ai-voice-bridge.cjs
 */

'use strict'

const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { randomBytes, timingSafeEqual } = require('node:crypto')
const { WebSocketServer, WebSocket } = require('ws')
const { DeepgramClient } = require('@deepgram/sdk')

const WS_PATH = '/voice/ws'
const BRIDGE_VERSION = '2.4.0-tier4'

/** Min RMS (int16 samples) to treat input slice as speech before Whisper (skip silence). */
const MIN_INPUT_RMS = 120
/** RMS threshold on 20ms frames while AI is playing — user likely speaking over the assistant. */
const BARGE_IN_RMS = 650
/** Consecutive high-RMS frames required to trigger barge-in. */
const BARGE_IN_STREAK = 3

/** Compare two UTF-8 strings in constant time; returns false if lengths differ. */
function timingSafeEqualUtf8(a, b) {
  const bufA = Buffer.from(String(a), 'utf8')
  const bufB = Buffer.from(String(b), 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Strip optional surrounding quotes from .env values (same convention as `electron/main.cjs` loadEnvFromFile). */
function stripEnvValueQuotes(raw) {
  let val = String(raw).trim().replaceAll('\r', '')
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1)
  }
  return val
}

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = stripEnvValueQuotes(m[2])
  }
}

function pcm16ToWav(pcm, sampleRate) {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcm.length
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(numChannels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  pcm.copy(buf, 44)
  return buf
}

/** OpenAI speech PCM is 24 kHz int16 LE — downsample to 16 kHz for Vonage */
function resample24kTo16k(pcm24) {
  const inSamples = pcm24.length / 2
  const ratio = 24000 / 16000
  const outSamples = Math.floor(inSamples / ratio)
  const out = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, inSamples - 1)
    const frac = srcPos - i0
    const s0 = pcm24.readInt16LE(i0 * 2)
    const s1 = pcm24.readInt16LE(i1 * 2)
    const s = Math.round(s0 + (s1 - s0) * frac)
    out.writeInt16LE(s, i * 2)
  }
  return out
}

/**
 * RMS energy of 16-bit LE mono PCM (any length >= 2 bytes).
 * @param {Buffer} pcm16
 * @returns {number}
 */
function computeRms(pcm16) {
  if (!pcm16 || pcm16.length < 2) return 0
  const n = pcm16.length / 2
  let sum = 0
  for (let i = 0; i < n; i++) {
    const s = pcm16.readInt16LE(i * 2)
    sum += s * s
  }
  return Math.sqrt(sum / n)
}

/**
 * Send PCM to Vonage in 640-byte (20ms @ 16kHz) frames; yields occasionally so inbound WS can run (barge-in).
 * @param {import('ws')} ws
 * @param {Buffer} pcm16
 * @param {{ shouldAbort?: () => boolean }} [opts]
 */
async function sendPcmInVonageChunks(ws, pcm16, opts = {}) {
  const chunk = 640
  let o = 0
  let n = 0
  while (o < pcm16.length) {
    if (opts.shouldAbort?.()) return
    const end = Math.min(o + chunk, pcm16.length)
    let part = pcm16.subarray(o, end)
    if (part.length < chunk) {
      const pad = Buffer.alloc(chunk)
      part.copy(pad)
      part = pad
    }
    if (ws.readyState === 1) ws.send(part)
    o += chunk
    n += 1
    if (n % 8 === 0) await new Promise((resolve) => setImmediate(resolve))
  }
}

async function whisperTranscribe(pcm16, sampleRate, apiKey, base, signal) {
  const wav = pcm16ToWav(pcm16, sampleRate)
  const boundary = `----JarvisForm${Date.now().toString(36)}${randomBytes(8).toString('hex')}`
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      'utf8',
    ),
    wav,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`,
      'utf8',
    ),
  ])
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Whisper ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.text || '').trim()
}

async function chatReply(messages, apiKey, base, signal) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages,
    }),
    signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Chat ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  return (content || '').trim() || 'Sorry, I could not answer that.'
}

/**
 * Extract leading complete sentences (…[.!?] followed by space or end). Remainder stays buffered.
 * @param {string} buf
 * @returns {{ sentences: string[], remainder: string }}
 */
function pullAllCompleteSentences(buf) {
  const sentences = []
  let s = buf
  while (s.length > 0) {
    const m = s.match(/^([\s\S]+?[.!?])(?=\s|$)/)
    if (!m) break
    const piece = m[1].trim()
    if (piece) sentences.push(piece)
    s = s.slice(m[0].length).trimStart()
  }
  return { sentences, remainder: s }
}

/**
 * Async iterator: OpenAI chat completions with `stream: true`, yielding speakable sentence chunks.
 * @param {Array<{ role: string, content: string }>} messages
 */
async function* streamSentencesFromChat(messages, apiKey, base, signal) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages,
      stream: true,
    }),
    signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Chat ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  if (!res.body) throw new Error('Chat stream: empty body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  let textBuf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.startsWith('data: ') ? line.slice(6).trim() : line.slice(5).trim()
      if (payload === '[DONE]') continue
      let json
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = json.choices?.[0]?.delta?.content
      if (!delta) continue
      textBuf += delta
      while (true) {
        const { sentences, remainder } = pullAllCompleteSentences(textBuf)
        textBuf = remainder
        for (const sent of sentences) {
          if (sent) yield sent
        }
        if (sentences.length === 0) break
      }
    }
  }
  if (lineBuf.trim()) {
    const tailLines = lineBuf.split('\n')
    for (const line of tailLines) {
      if (!line.startsWith('data:')) continue
      const payload = line.startsWith('data: ') ? line.slice(6).trim() : line.slice(5).trim()
      if (payload === '[DONE]') continue
      let json
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = json.choices?.[0]?.delta?.content
      if (!delta) continue
      textBuf += delta
      while (true) {
        const { sentences, remainder } = pullAllCompleteSentences(textBuf)
        textBuf = remainder
        for (const sent of sentences) {
          if (sent) yield sent
        }
        if (sentences.length === 0) break
      }
    }
  }
  while (true) {
    const { sentences, remainder } = pullAllCompleteSentences(textBuf)
    textBuf = remainder
    for (const sent of sentences) {
      if (sent) yield sent
    }
    if (sentences.length === 0) break
  }
  const tail = textBuf.trim()
  if (tail) yield tail
}

/**
 * @param {Record<string, string>} env
 */
function streamingLlmEnabled(env) {
  const raw = String(env.VONAGE_AI_STREAMING_LLM ?? '1').trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

async function ttsPcm(text, apiKey, base, signal, voice) {
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: voice || 'alloy',
      input: text.slice(0, 4000),
      response_format: 'pcm',
    }),
    signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`TTS ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * @param {Record<string, string>} env
 */
function hasElevenLabsBridgeEnv(env) {
  return Boolean((env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim())
}

/**
 * ElevenLabs WebSocket `stream-input` with `pcm_16000`, streaming base64 audio chunks to Vonage as 640-byte L16 frames.
 * @param {import('ws')} vonageWs
 * @param {string} text
 * @param {Record<string, string>} env
 * @param {AbortController} ac
 * @param {() => boolean} shouldAbort
 */
function streamElevenLabsPcmToVonage(vonageWs, text, env, ac, shouldAbort) {
  const apiKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  const voiceId =
    (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim() || 'pNInz6obpgDQGcFmaJgB'
  const modelId = (
    env.VONAGE_ELEVENLABS_MODEL_ID ||
    env.ELEVENLABS_MODEL_ID ||
    env.VITE_ELEVENLABS_MODEL_ID ||
    'eleven_flash_v2_5'
  ).trim()

  const params = new URLSearchParams({
    model_id: modelId,
    output_format: 'pcm_16000',
  })
  const uri = `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?${params.toString()}`

  let pending = Buffer.alloc(0)
  const FRAME = 640

  function feedPcm(pcm) {
    pending = Buffer.concat([pending, pcm])
    while (pending.length >= FRAME && !shouldAbort()) {
      const frame = pending.subarray(0, FRAME)
      pending = pending.subarray(FRAME)
      if (vonageWs.readyState === 1) vonageWs.send(frame)
    }
  }

  function flushPending() {
    if (pending.length === 0 || shouldAbort()) return
    const pad = Buffer.alloc(FRAME)
    pending.copy(pad)
    pending = Buffer.alloc(0)
    if (vonageWs.readyState === 1) vonageWs.send(pad)
  }

  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('Missing ELEVENLABS_API_KEY'))
      return
    }
    if (ac.signal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
      return
    }

    let settled = false
    const elWs = new WebSocket(uri, { headers: { 'xi-api-key': apiKey } })

    const cleanup = () => {
      ac.signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        elWs.close()
      } catch {
        /* ignore */
      }
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }

    ac.signal.addEventListener('abort', onAbort, { once: true })

    elWs.on('open', () => {
      const safe = String(text || '').slice(0, 4000)
      elWs.send(
        JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
          },
          generation_config: { chunk_length_schedule: [40, 80, 120, 200] },
        }),
      )
      elWs.send(JSON.stringify({ text: safe, flush: true }))
      elWs.send(JSON.stringify({ text: '' }))
    })

    elWs.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg.error || msg.message) {
        const raw = msg.error ?? msg.message
        const errText =
          typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 300) || 'ElevenLabs error'
        if (!settled) {
          settled = true
          cleanup()
          try {
            elWs.close()
          } catch {
            /* ignore */
          }
          reject(new Error(errText.slice(0, 300)))
        }
        return
      }
      if (msg.audio && typeof msg.audio === 'string') {
        try {
          const pcm = Buffer.from(msg.audio, 'base64')
          feedPcm(pcm)
        } catch {
          /* ignore */
        }
      }
    })

    elWs.on('close', () => {
      if (settled) return
      settled = true
      cleanup()
      flushPending()
      resolve()
    })

    elWs.on('error', (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

/**
 * ElevenLabs `stream-input`: init, then one `flush` per sentence from `sentenceGen`, then close text.
 * @param {import('ws')} vonageWs
 * @param {AsyncIterable<string>} sentenceGen
 * @param {Record<string, string>} env
 * @param {AbortController} ac
 * @param {() => boolean} shouldAbort
 */
function streamElevenLabsPcmToVonageFromAsyncGenerator(vonageWs, sentenceGen, env, ac, shouldAbort) {
  const apiKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  const voiceId =
    (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim() || 'pNInz6obpgDQGcFmaJgB'
  const modelId = (
    env.VONAGE_ELEVENLABS_MODEL_ID ||
    env.ELEVENLABS_MODEL_ID ||
    env.VITE_ELEVENLABS_MODEL_ID ||
    'eleven_flash_v2_5'
  ).trim()

  const params = new URLSearchParams({
    model_id: modelId,
    output_format: 'pcm_16000',
  })
  const uri = `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?${params.toString()}`

  let pending = Buffer.alloc(0)
  const FRAME = 640

  function feedPcm(pcm) {
    pending = Buffer.concat([pending, pcm])
    while (pending.length >= FRAME && !shouldAbort()) {
      const frame = pending.subarray(0, FRAME)
      pending = pending.subarray(FRAME)
      if (vonageWs.readyState === 1) vonageWs.send(frame)
    }
  }

  function flushPending() {
    if (pending.length === 0 || shouldAbort()) return
    const pad = Buffer.alloc(FRAME)
    pending.copy(pad)
    pending = Buffer.alloc(0)
    if (vonageWs.readyState === 1) vonageWs.send(pad)
  }

  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('Missing ELEVENLABS_API_KEY'))
      return
    }
    if (ac.signal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
      return
    }

    let settled = false
    const elWs = new WebSocket(uri, { headers: { 'xi-api-key': apiKey } })

    const cleanup = () => {
      ac.signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        elWs.close()
      } catch {
        /* ignore */
      }
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }

    ac.signal.addEventListener('abort', onAbort, { once: true })

    elWs.on('open', () => {
      void (async () => {
        try {
          elWs.send(
            JSON.stringify({
              text: ' ',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0,
                use_speaker_boost: true,
              },
              generation_config: { chunk_length_schedule: [40, 80, 120, 200] },
            }),
          )
          for await (const sentence of sentenceGen) {
            if (shouldAbort() || ac.signal.aborted) {
              const err = new Error('Aborted')
              err.name = 'AbortError'
              throw err
            }
            const safe = String(sentence || '').trim().slice(0, 4000)
            if (safe) elWs.send(JSON.stringify({ text: safe, flush: true }))
          }
          elWs.send(JSON.stringify({ text: '' }))
        } catch (e) {
          if (!settled) {
            settled = true
            cleanup()
            try {
              elWs.close()
            } catch {
              /* ignore */
            }
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        }
      })()
    })

    elWs.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg.error || msg.message) {
        const raw = msg.error ?? msg.message
        const errText =
          typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 300) || 'ElevenLabs error'
        if (!settled) {
          settled = true
          cleanup()
          try {
            elWs.close()
          } catch {
            /* ignore */
          }
          reject(new Error(errText.slice(0, 300)))
        }
        return
      }
      if (msg.audio && typeof msg.audio === 'string') {
        try {
          const pcm = Buffer.from(msg.audio, 'base64')
          feedPcm(pcm)
        } catch {
          /* ignore */
        }
      }
    })

    elWs.on('close', () => {
      if (settled) return
      settled = true
      cleanup()
      flushPending()
      resolve()
    })

    elWs.on('error', (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

/**
 * OpenAI TTS per sentence from an async iterable (Tier 4 when ElevenLabs is off).
 * @param {import('ws')} ws
 * @param {AsyncIterable<string>} sentenceGen
 */
async function streamOpenAiTtsPcmToVonageFromAsyncGenerator(ws, sentenceGen, apiKey, base, ac, shouldAbort, voice) {
  for await (const sentence of sentenceGen) {
    if (shouldAbort() || ac.signal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      throw err
    }
    const safe = String(sentence || '').trim()
    if (!safe) continue
    const pcm24 = await ttsPcm(safe, apiKey, base, ac.signal, voice)
    if (shouldAbort() || ac.signal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      throw err
    }
    const pcm16 = resample24kTo16k(pcm24)
    await sendPcmInVonageChunks(ws, pcm16, { shouldAbort })
  }
}

/** Short-circuit replies for common phrases (no LLM). */
function cachedReply(userText) {
  const t = userText.toLowerCase().trim()
  if (/^(hi|hello|hey|good morning|good afternoon)\b/.test(t)) {
    return "Hi, I'm Jarvis on the line. What can I do for you?"
  }
  if (/^(thanks|thank you|cheers)\b/.test(t)) {
    return "You're welcome."
  }
  if (/^(bye|goodbye)\b/.test(t)) {
    return 'Goodbye for now.'
  }
  return null
}

/**
 * @param {unknown} data Deepgram `listen.v1` JSON message
 * @returns {{ transcript: string, isFinal: boolean } | null}
 */
function parseDeepgramResults(data) {
  if (!data || typeof data !== 'object') return null
  const d = /** @type {Record<string, unknown>} */ (data)
  if (d.type !== 'Results') return null
  const ch = d.channel
  if (!ch || typeof ch !== 'object') return null
  const alts = /** @type {{ alternatives?: Array<{ transcript?: string }> }} */ (ch).alternatives
  const transcript = String(alts?.[0]?.transcript || '').trim()
  const isFinal = d.is_final === true
  return { transcript, isFinal }
}

function createBridge(getEnv) {
  let activeSessions = 0

  function getKeyBase() {
    const env = getEnv()
    const key = (env.OPENAI_API_KEY || '').trim()
    const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    return { key, base, env }
  }

  function buildSystemPrompt(env) {
    const custom = (env.VONAGE_AI_SYSTEM_PROMPT || '').trim()
    if (custom) return custom

    const userName = (env.VONAGE_AI_USER_NAME || env.JARVIS_USER_NAME || '').trim()
    const userGreeting = userName ? ` Your user's name is ${userName}.` : ''

    return `You are Jarvis, an advanced AI assistant on a live phone call.${userGreeting}

Core rules for phone conversations:
- Speak in short, natural sentences (1-3 sentences per turn). No one wants a lecture on a phone call.
- Never use markdown, bullet points, numbered lists, code blocks, or any visual formatting — the caller hears everything spoken aloud.
- Spell out abbreviations and symbols: say "percent" not "%", "dollars" not "$", "at" not "@".
- If you don't know something, say so briefly and offer to look into it.
- Be warm but efficient. Phone time is valuable.
- You can send SMS (vonage_send_sms) and read received texts (vonage_read_sms) if the caller asks.
- You have access to the same capabilities as your text chat mode — search, email, calendar, code, files — but keep answers conversational and concise for voice.
- If the caller asks you to do something complex, confirm the key details before acting.
- Never say you cannot make calls or send texts — you are already on the phone doing exactly that.

Voice style: conversational, confident, helpful. Mirror the caller's energy — if they're casual, be casual; if they're formal, be professional.`
  }

  function maxTurns() {
    const raw = String(getEnv().VONAGE_AI_MAX_TURNS || '30').trim()
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 30
  }

  function pollMs() {
    const raw = String(getEnv().VONAGE_AI_VOICE_POLL_MS || '4500').trim()
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 1500 ? n : 4500
  }

  function hasDeepgramKey() {
    return Boolean((getEnv().DEEPGRAM_API_KEY || '').trim())
  }

  /**
   * Tier 4: streaming chat → sentences → ElevenLabs multi-flush or OpenAI TTS per sentence.
   * @returns {Promise<{ reply: string, chatMs: number, ttsMs: number, ttsKind: 'elevenlabs' | 'openai', firstSentenceMs: number | null }>}
   */
  async function runStreamingLlmTurn(ws, session, messages, key, base, ac, tc0) {
    session.state = 'responding'
    const tt0 = Date.now()
    let fullText = ''
    /** @type {number | null} */
    let firstSentenceMs = null
    let llmDoneAt = 0

    async function* sentenceGen() {
      for await (const s of streamSentencesFromChat(messages, key, base, ac.signal)) {
        if (firstSentenceMs === null) firstSentenceMs = Date.now() - tc0
        fullText += (fullText ? ' ' : '') + String(s || '').trim()
        yield s
      }
      llmDoneAt = Date.now()
    }

    const bridgeEnv = getEnv()
    /** @type {'elevenlabs' | 'openai'} */
    let ttsKind = 'openai'

    try {
      if (hasElevenLabsBridgeEnv(bridgeEnv)) {
        try {
          await streamElevenLabsPcmToVonageFromAsyncGenerator(
            ws,
            sentenceGen(),
            bridgeEnv,
            ac,
            () => ac.signal.aborted || session.state !== 'responding',
          )
          ttsKind = 'elevenlabs'
        } catch (e) {
          const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
          if (name === 'AbortError') throw e
          console.warn(
            '[vonage-ai-voice] ElevenLabs streaming TTS failed, batch OpenAI TTS fallback:',
            e instanceof Error ? e.message : e,
          )
          const batchReply = await chatReply(messages, key, base, ac.signal)
          fullText = batchReply.trim()
          llmDoneAt = Date.now()
          const pcm24 = await ttsPcm(batchReply, key, base, ac.signal, getEnv().VONAGE_AI_OPENAI_VOICE || 'alloy')
          if (ac.signal.aborted) {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            throw err
          }
          const pcm16 = resample24kTo16k(pcm24)
          await sendPcmInVonageChunks(ws, pcm16, {
            shouldAbort: () => ac.signal.aborted || session.state !== 'responding',
          })
          ttsKind = 'openai'
        }
      } else {
        await streamOpenAiTtsPcmToVonageFromAsyncGenerator(ws, sentenceGen(), key, base, ac, () =>
          ac.signal.aborted || session.state !== 'responding',
        getEnv().VONAGE_AI_OPENAI_VOICE || 'alloy')
        ttsKind = 'openai'
      }
    } catch (e) {
      session.state = 'listening'
      throw e
    }

    const ttsMs = Date.now() - tt0
    const reply = fullText.trim() || 'Sorry, I could not answer that.'
    const chatMs = llmDoneAt > 0 ? llmDoneAt - tc0 : Date.now() - tc0
    session.state = 'listening'
    return { reply, chatMs, ttsMs, ttsKind, firstSentenceMs }
  }

  /**
   * Shared LLM + TTS leg (Whisper or Deepgram provides `userText`).
   * @param {import('ws')} ws
   * @param {object} session
   * @param {string} userText
   * @param {AbortController} ac
   * @param {{ sttMs: number, sttLabel: string }} meta
   */
  async function runAssistantTurn(ws, session, userText, ac, meta) {
    const { key, base } = getKeyBase()
    if (!key) {
      session.state = 'listening'
      return
    }

    session.history.push({ role: 'user', content: userText })
    const messages = [{ role: 'system', content: buildSystemPrompt(getEnv()) }, ...session.history]

    let reply = cachedReply(userText)
    let usedCache = false
    const tc0 = Date.now()
    let chatMs = 0
    /** @type {number | null} */
    let firstSentenceMs = null

    if (reply) {
      usedCache = true
      session.metrics.cachedHits += 1
    } else if (streamingLlmEnabled(getEnv())) {
      try {
        const out = await runStreamingLlmTurn(ws, session, messages, key, base, ac, tc0)
        reply = out.reply
        chatMs = out.chatMs
        firstSentenceMs = out.firstSentenceMs
        session.history.push({ role: 'assistant', content: reply })
        session.turns += 1

        if (session.turns > maxTurns()) {
          if (ws.readyState === 1) ws.close()
          return
        }

        if (ac.signal.aborted) {
          session.state = 'listening'
          return
        }

        const msBase =
          meta.sttLabel === 'deepgram'
            ? { chat: chatMs, tts: out.ttsMs, ttsKind: out.ttsKind, deepgram: true, streaming: true }
            : {
                chat: chatMs,
                tts: out.ttsMs,
                ttsKind: out.ttsKind,
                whisper: meta.sttMs,
                streaming: true,
              }
        const ms = firstSentenceMs != null ? { ...msBase, firstSentenceMs } : msBase

        console.log('[vonage-ai-voice] turn', {
          version: BRIDGE_VERSION,
          callUuid: session.callUuid || null,
          turn: session.turns,
          stt: meta.sttLabel,
          cached: usedCache,
          ms,
          bargeIns: session.metrics.bargeIns,
        })
        return
      } catch (e) {
        const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
        if (name === 'AbortError') {
          session.state = 'listening'
          return
        }
        console.warn(
          '[vonage-ai-voice] streaming LLM pipeline failed, batch chat + Tier 3 TTS:',
          e instanceof Error ? e.message : e,
        )
        reply = await chatReply(messages, key, base, ac.signal)
        chatMs = Date.now() - tc0
      }
    } else {
      reply = await chatReply(messages, key, base, ac.signal)
      chatMs = Date.now() - tc0
    }

    session.history.push({ role: 'assistant', content: reply })
    session.turns += 1

    if (session.turns > maxTurns()) {
      if (ws.readyState === 1) ws.close()
      return
    }

    if (ac.signal.aborted) {
      session.state = 'listening'
      return
    }

    session.state = 'responding'
    const tt0 = Date.now()
    const bridgeEnv = getEnv()
    let ttsMs = 0
    /** @type {'elevenlabs' | 'openai'} */
    let ttsKind = 'openai'

    try {
      if (hasElevenLabsBridgeEnv(bridgeEnv)) {
        try {
          await streamElevenLabsPcmToVonage(
            ws,
            reply,
            bridgeEnv,
            ac,
            () => ac.signal.aborted || session.state !== 'responding',
          )
          ttsKind = 'elevenlabs'
        } catch (e) {
          const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
          if (name === 'AbortError') throw e
          console.warn(
            '[vonage-ai-voice] ElevenLabs TTS failed, OpenAI fallback:',
            e instanceof Error ? e.message : e,
          )
          const pcm24 = await ttsPcm(reply, key, base, ac.signal, getEnv().VONAGE_AI_OPENAI_VOICE || 'alloy')
          if (ac.signal.aborted) {
            session.state = 'listening'
            return
          }
          const pcm16 = resample24kTo16k(pcm24)
          await sendPcmInVonageChunks(ws, pcm16, {
            shouldAbort: () => ac.signal.aborted || session.state !== 'responding',
          })
          ttsKind = 'openai'
        }
      } else {
        const pcm24 = await ttsPcm(reply, key, base, ac.signal, getEnv().VONAGE_AI_OPENAI_VOICE || 'alloy')
        if (ac.signal.aborted) {
          session.state = 'listening'
          return
        }
        const pcm16 = resample24kTo16k(pcm24)
        await sendPcmInVonageChunks(ws, pcm16, {
          shouldAbort: () => ac.signal.aborted || session.state !== 'responding',
        })
        ttsKind = 'openai'
      }
    } finally {
      ttsMs = Date.now() - tt0
    }

    if (ac.signal.aborted) {
      session.state = 'listening'
      return
    }

    session.state = 'listening'

    const ms =
      meta.sttLabel === 'deepgram'
        ? { chat: chatMs, tts: ttsMs, ttsKind, deepgram: true }
        : { chat: chatMs, tts: ttsMs, ttsKind, whisper: meta.sttMs }

    console.log('[vonage-ai-voice] turn', {
      version: BRIDGE_VERSION,
      callUuid: session.callUuid || null,
      turn: session.turns,
      stt: meta.sttLabel,
      cached: usedCache,
      ms,
      bargeIns: session.metrics.bargeIns,
    })
  }

  const server = http.createServer((req, res) => {
    if (req.url?.split('?')[0] === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          service: 'vonage-ai-voice-bridge',
          version: BRIDGE_VERSION,
          activeSessions,
          stt: hasDeepgramKey() ? 'deepgram-streaming' : 'whisper-batch',
          tts: hasElevenLabsBridgeEnv(getKeyBase().env) ? 'elevenlabs-ws' : 'openai-pcm',
          streamingLlm: streamingLlmEnabled(getKeyBase().env),
        }),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url || '/', 'http://localhost')
    if (u.pathname !== WS_PATH) {
      socket.destroy()
      return
    }
    const { env } = getKeyBase()
    const secret = (env.VONAGE_WS_SECRET || '').trim()
    if (secret && !timingSafeEqualUtf8(u.searchParams.get('token') ?? '', secret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    activeSessions += 1

    /** @type {'idle' | 'listening' | 'processing' | 'responding'} */
    const session = {
      state: 'listening',
      buf: Buffer.alloc(0),
      /** Audio before Deepgram WebSocket is ready */
      preDgBuf: Buffer.alloc(0),
      /** @type {'pending' | 'ready' | 'failed' | 'off'} */
      dgInit: hasDeepgramKey() ? 'pending' : 'off',
      dgConn: null,
      dgLastText: '',
      dgLastAt: 0,
      history: [],
      turns: 0,
      timer: null,
      callUuid: null,
      processingLock: false,
      /** @type {AbortController | null} */
      inFlight: null,
      bargeStreak: 0,
      metrics: {
        t0: Date.now(),
        bargeIns: 0,
        cachedHits: 0,
      },
    }

    function cleanupSession() {
      if (session.timer) {
        clearInterval(session.timer)
        session.timer = null
      }
      try {
        session.dgConn?.close()
      } catch {
        /* ignore */
      }
      session.dgConn = null
      try {
        session.inFlight?.abort()
      } catch {
        /* ignore */
      }
      session.inFlight = null
      session.buf = Buffer.alloc(0)
      session.preDgBuf = Buffer.alloc(0)
      session.history = []
      session.state = 'idle'
      session.processingLock = false
    }

    function appendListenAudio(chunk) {
      if (session.state !== 'listening') return
      if (session.dgInit === 'pending' && hasDeepgramKey()) {
        session.preDgBuf = Buffer.concat([session.preDgBuf, chunk])
        if (session.preDgBuf.length > 960000) {
          session.preDgBuf = session.preDgBuf.subarray(session.preDgBuf.length - 480000)
        }
        return
      }
      if (session.dgInit === 'ready' && session.dgConn) {
        try {
          if (session.dgConn.readyState === 1) session.dgConn.sendMedia(chunk)
        } catch (e) {
          console.error('[vonage-ai-voice] Deepgram sendMedia:', e instanceof Error ? e.message : e)
        }
        return
      }
      session.buf = Buffer.concat([session.buf, chunk])
      if (session.buf.length > 960000) {
        session.buf = session.buf.subarray(session.buf.length - 480000)
      }
    }

    async function initDeepgramLive() {
      const env = getEnv()
      const dgKey = (env.DEEPGRAM_API_KEY || '').trim()
      if (!dgKey) return false
      const client = new DeepgramClient({ apiKey: dgKey })
      const model = (env.DEEPGRAM_MODEL || 'nova-2').trim()
      const endpointing = (env.DEEPGRAM_ENDPOINTING_MS || '400').trim()
      const conn = await client.listen.v1.connect({
        model,
        language: 'en',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        punctuate: true,
        interim_results: true,
        endpointing,
        smart_format: true,
      })

      conn.on('message', (data) => {
        const parsed = parseDeepgramResults(data)
        if (!parsed || !parsed.isFinal || parsed.transcript.length < 2) return
        if (session.state !== 'listening' || session.processingLock) return
        const now = Date.now()
        if (parsed.transcript === session.dgLastText && now - session.dgLastAt < 900) return
        session.dgLastText = parsed.transcript
        session.dgLastAt = now

        void (async () => {
          const ac = new AbortController()
          session.inFlight = ac
          session.processingLock = true
          session.state = 'processing'
          try {
            await runAssistantTurn(ws, session, parsed.transcript, ac, {
              sttMs: 0,
              sttLabel: 'deepgram',
            })
          } catch (e) {
            const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
            if (name !== 'AbortError') console.error('[vonage-ai-voice]', e)
            session.state = 'listening'
          } finally {
            session.processingLock = false
            session.inFlight = null
            if (session.state === 'processing') session.state = 'listening'
          }
        })()
      })

      conn.on('error', (err) => {
        console.error('[vonage-ai-voice] Deepgram:', err instanceof Error ? err.message : err)
      })

      conn.connect()
      await conn.waitForOpen()
      session.dgConn = conn
      return true
    }

    async function processChunk() {
      if (session.state !== 'listening') return
      if (session.processingLock) return
      if (session.dgInit === 'ready') return
      const { key, base } = getKeyBase()
      if (!key) return
      const minBytes = 48000
      if (session.buf.length < minBytes) return

      const ac = new AbortController()
      session.inFlight = ac
      session.processingLock = true
      session.state = 'processing'

      try {
        const take = Math.min(session.buf.length, 320000)
        const slice = session.buf.subarray(0, take)
        session.buf = session.buf.subarray(take - 16000 > 0 ? take - 16000 : 0)

        const sliceRms = computeRms(slice)
        if (sliceRms < MIN_INPUT_RMS) {
          session.state = 'listening'
          return
        }

        const tw0 = Date.now()
        const text = await whisperTranscribe(slice, 16000, key, base, ac.signal)
        const whisperMs = Date.now() - tw0
        if (!text || text.length < 2) {
          session.state = 'listening'
          return
        }

        await runAssistantTurn(ws, session, text, ac, { sttMs: whisperMs, sttLabel: 'whisper' })
      } catch (e) {
        const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : ''
        if (name === 'AbortError') {
          session.state = 'listening'
          return
        }
        console.error('[vonage-ai-voice]', e)
        session.state = 'listening'
      } finally {
        session.processingLock = false
        session.inFlight = null
        if (session.state === 'processing') session.state = 'listening'
      }
    }

    function startWhisperPoll() {
      if (session.timer) return
      session.timer = setInterval(() => {
        processChunk().catch(() => {})
      }, pollMs())
    }

    void (async () => {
      if (hasDeepgramKey()) {
        try {
          await initDeepgramLive()
          session.dgInit = 'ready'
          if (session.preDgBuf.length > 0) {
            try {
              if (session.dgConn && session.dgConn.readyState === 1) {
                session.dgConn.sendMedia(session.preDgBuf)
              }
            } catch (e) {
              console.error('[vonage-ai-voice] Deepgram flush:', e instanceof Error ? e.message : e)
            }
            session.preDgBuf = Buffer.alloc(0)
          }
        } catch (e) {
          console.error(
            '[vonage-ai-voice] Deepgram init failed, using Whisper batch:',
            e instanceof Error ? e.message : e,
          )
          session.dgInit = 'failed'
          session.dgConn = null
          if (session.preDgBuf.length > 0) {
            session.buf = Buffer.concat([session.buf, session.preDgBuf])
            session.preDgBuf = Buffer.alloc(0)
          }
          startWhisperPoll()
        }
      } else {
        session.dgInit = 'off'
        startWhisperPoll()
      }
    })()

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.event === 'websocket:connected' || msg.type === 'websocket:connected') {
            session.callUuid = msg.uuid || msg.connection_id || msg.call_uuid || msg.id || null
            session.state = 'listening'
            return
          }
          if (msg.event === 'websocket:cleared' || msg.type === 'websocket:cleared') {
            session.metrics.bargeIns += 1
            session.state = 'listening'
            session.bargeStreak = 0
            return
          }
          if (msg.event === 'start') {
            session.buf = Buffer.alloc(0)
            session.preDgBuf = Buffer.alloc(0)
            session.state = 'listening'
            return
          }
          if (msg.event === 'media' && msg.media?.payload) {
            const b = Buffer.from(msg.media.payload, 'base64')
            if (session.state === 'listening') {
              appendListenAudio(b)
            } else if (session.state === 'responding') {
              const rms = computeRms(b)
              if (rms >= BARGE_IN_RMS) session.bargeStreak += 1
              else session.bargeStreak = 0
              if (session.bargeStreak >= BARGE_IN_STREAK) {
                session.bargeStreak = 0
                try {
                  if (ws.readyState === 1) ws.send(JSON.stringify({ action: 'clear' }))
                } catch {
                  /* ignore */
                }
                try {
                  session.inFlight?.abort()
                } catch {
                  /* ignore */
                }
                session.metrics.bargeIns += 1
                session.state = 'listening'
              }
            }
            return
          }
        } catch {
          /* ignore non-json */
        }
        return
      }

      if (!Buffer.isBuffer(data)) return

      if (session.state === 'responding') {
        const rms = computeRms(data)
        if (rms >= BARGE_IN_RMS) session.bargeStreak += 1
        else session.bargeStreak = 0
        if (session.bargeStreak >= BARGE_IN_STREAK) {
          session.bargeStreak = 0
          try {
            if (ws.readyState === 1) ws.send(JSON.stringify({ action: 'clear' }))
          } catch {
            /* ignore */
          }
          try {
            session.inFlight?.abort()
          } catch {
            /* ignore */
          }
          session.metrics.bargeIns += 1
          session.state = 'listening'
        }
        return
      }

      if (session.state !== 'listening') return

      appendListenAudio(data)
    })

    ws.on('close', () => {
      cleanupSession()
      activeSessions = Math.max(0, activeSessions - 1)
    })

    ws.on('error', (err) => {
      console.error('[vonage-ai-voice-bridge] ws error:', err instanceof Error ? err.message : err)
      cleanupSession()
      activeSessions = Math.max(0, activeSessions - 1)
    })
  })

  return { server, wss }
}

function startStandalone() {
  loadDotEnv()
  const port = Number.parseInt(process.env.VONAGE_AI_VOICE_PORT || '3339', 10)
  const getEnv = () => process.env
  const { server } = createBridge(getEnv)
  server.listen(port, '0.0.0.0', () => {
    console.log(`[vonage-ai-voice-bridge] listening on http://0.0.0.0:${String(port)}${WS_PATH} (WebSocket)`)
    console.log('[vonage-ai-voice-bridge] Set VONAGE_PUBLIC_WS_URL=wss://YOUR_NGROK_HOST/voice/ws?token=SECRET')
  })
}

function startFromElectron(getEnv) {
  if (process.env.VONAGE_AI_VOICE_BRIDGE_ENABLED !== '1') return null
  const port = Number.parseInt((getEnv().VONAGE_AI_VOICE_PORT || '3339').trim(), 10)
  const { server } = createBridge(getEnv)
  server.listen(port, '127.0.0.1', () => {
    console.log(`[vonage-ai-voice-bridge] ${String(port)} (local only — use ngrok to expose)`)
  })
  return server
}

module.exports = {
  createBridge,
  startStandalone,
  startFromElectron,
  WS_PATH,
  BRIDGE_VERSION,
  computeRms,
  pcm16ToWav,
  resample24kTo16k,
  sendPcmInVonageChunks,
  parseDeepgramResults,
  hasElevenLabsBridgeEnv,
  streamElevenLabsPcmToVonage,
  pullAllCompleteSentences,
  streamSentencesFromChat,
  streamingLlmEnabled,
  streamElevenLabsPcmToVonageFromAsyncGenerator,
  streamOpenAiTtsPcmToVonageFromAsyncGenerator,
}

if (require.main === module) {
  startStandalone()
}
