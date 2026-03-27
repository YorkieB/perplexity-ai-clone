/**
 * Vonage Voice WebSocket bridge: inbound L16 PCM → Whisper STT → OpenAI chat → TTS PCM → outbound chunks.
 * Must be reachable at wss://… (e.g. ngrok) — set VONAGE_PUBLIC_WS_URL to that URL for AI calls.
 *
 * Start: VONAGE_AI_VOICE_BRIDGE_ENABLED=1 (Electron loads this) or: node electron/vonage-ai-voice-bridge.cjs
 */

'use strict'

const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { WebSocketServer } = require('ws')

const WS_PATH = '/voice/ws'

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replaceAll('\r', '')
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

function sendPcmInVonageChunks(ws, pcm16) {
  const chunk = 640
  let o = 0
  while (o < pcm16.length) {
    const end = Math.min(o + chunk, pcm16.length)
    let part = pcm16.subarray(o, end)
    if (part.length < chunk) {
      const pad = Buffer.alloc(chunk)
      part.copy(pad)
      part = pad
    }
    if (ws.readyState === 1) ws.send(part)
    o += chunk
  }
}

async function whisperTranscribe(pcm16, sampleRate, apiKey, base) {
  const wav = pcm16ToWav(pcm16, sampleRate)
  const boundary = `----JarvisForm${String(Date.now())}`
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
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Whisper ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.text || '').trim()
}

async function chatReply(messages, apiKey, base) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Chat ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  return (content || '').trim() || 'Sorry, I could not answer that.'
}

async function ttsPcm(text, apiKey, base) {
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: text.slice(0, 4000),
      response_format: 'pcm',
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`TTS ${String(res.status)}: ${t.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function createBridge(getEnv) {
  function getKeyBase() {
    const env = getEnv()
    const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
    const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    return { key, base, env }
  }

  const server = http.createServer((req, res) => {
    if (req.url?.split('?')[0] === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'vonage-ai-voice-bridge' }))
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
    if (secret && u.searchParams.get('token') !== secret) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    const state = {
      buf: Buffer.alloc(0),
      history: [],
      turns: 0,
      timer: null,
      processing: false,
    }

    const systemPrompt =
      'You are Jarvis on a phone call. Reply in short, natural spoken sentences (one or two sentences). No markdown, no lists.'

    async function processChunk() {
      if (state.processing) return
      const { key, base } = getKeyBase()
      if (!key) return
      const minBytes = 48000
      if (state.buf.length < minBytes) return
      state.processing = true
      try {
        const take = Math.min(state.buf.length, 320000)
        const slice = state.buf.subarray(0, take)
        state.buf = state.buf.subarray(take - 16000 > 0 ? take - 16000 : 0)

        const text = await whisperTranscribe(slice, 16000, key, base)
        if (!text || text.length < 2) return

        state.history.push({ role: 'user', content: text })
        const messages = [{ role: 'system', content: systemPrompt }, ...state.history]
        const reply = await chatReply(messages, key, base)
        state.history.push({ role: 'assistant', content: reply })
        state.turns += 1
        if (state.turns > 15) {
          if (ws.readyState === 1) ws.close()
          return
        }

        const pcm24 = await ttsPcm(reply, key, base)
        const pcm16 = resample24kTo16k(pcm24)
        sendPcmInVonageChunks(ws, pcm16)
      } catch (e) {
        console.error('[vonage-ai-voice]', e)
      } finally {
        state.processing = false
      }
    }

    state.timer = setInterval(() => {
      processChunk().catch(() => {})
    }, 4500)

    ws.on('message', (data, isBinary) => {
      if (isBinary && Buffer.isBuffer(data)) {
        state.buf = Buffer.concat([state.buf, data])
        if (state.buf.length > 960000) {
          state.buf = state.buf.subarray(state.buf.length - 480000)
        }
        return
      }
      try {
        const msg = JSON.parse(data.toString())
        if (msg.event === 'media' && msg.media?.payload) {
          const b = Buffer.from(msg.media.payload, 'base64')
          state.buf = Buffer.concat([state.buf, b])
        }
        if (msg.event === 'start') {
          state.buf = Buffer.alloc(0)
        }
      } catch {
        /* ignore non-json */
      }
    })

    ws.on('close', () => {
      if (state.timer) clearInterval(state.timer)
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

module.exports = { createBridge, startStandalone, startFromElectron, WS_PATH }

if (require.main === module) {
  startStandalone()
}
