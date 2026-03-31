/**
 * Dev / `vite preview` middleware: keeps OpenAI credentials server-side.
 *
 * Routes:
 * - `POST /api/llm` — chat completions (existing).
 * - `POST /api/realtime/session` — mints a short-lived Realtime client secret via
 *   `POST https://api.openai.com/v1/realtime/client_secrets` using `OPENAI_API_KEY`.
 *   The browser must **not** receive the long-lived API key; it only gets the returned
 *   `value` (ephemeral key) and uses it with WebRTC per OpenAI’s Realtime docs:
 *   WebRTC offer → `POST /v1/realtime/calls` with `Authorization: Bearer <ephemeral>`.
 *
 * No separate Node server is required: this uses Vite’s Connect middleware in dev and
 * preview. Production static hosting still needs an equivalent backend route.
 *
 * - `POST /api/elevenlabs-tts` — streaming PCM TTS (same behaviour as Electron’s handler).
 * - `POST /api/tts` — OpenAI `audio/speech` or ElevenLabs (same behaviour as Electron’s handler).
 */
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { ServerResponse } from 'node:http'
import { randomInt } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pipeline, Readable } from 'node:stream'
import { tokenGenerate } from '@vonage/jwt'

const requireVonage = createRequire(import.meta.url)
const _pluginDir = dirname(fileURLToPath(import.meta.url))
const vonageShared = requireVonage(join(_pluginDir, '..', 'scripts', 'vonage-voice-shared.cjs')) as {
  normalizeVonagePhoneDigits: (raw: string) => string
  loadVonagePrivateKeyPem: (env: Record<string, string>) => string
  buildVonageAiVoiceWebSocketUri: (env: Record<string, string>) => string | null
}

const elevenLabsSharedVoices = requireVonage(join(_pluginDir, '..', 'scripts', 'elevenlabs-shared-voices-query.cjs')) as {
  buildAllowedElevenLabsSharedVoicesQuery: (rawQuery: string) => string
}

const sunoGenerateBody = requireVonage(join(_pluginDir, '..', 'scripts', 'suno-generate-body.cjs')) as {
  buildAllowedSunoGenerateBody: (parsed: unknown) => Record<string, unknown>
}

const llmChatBody = requireVonage(join(_pluginDir, '..', 'scripts', 'llm-chat-completion-body.cjs')) as {
  normalizeLlmChatCompletionBody: (bodyStr: string, env: Record<string, string | undefined>, provider: 'openai' | 'digitalocean') => string
}

const openaiTtsSpeechBody = requireVonage(join(_pluginDir, '..', 'scripts', 'openai-tts-speech-body.cjs')) as {
  normalizeOpenAiAudioSpeechBody: (
    bodyStr: string
  ) => { ok: true; body: string } | { ok: false; status: number; message: string }
}

/** ImapFlow envelope address shape (minimal for formatting). */
type MailAddr = { name?: string; address?: string }

function formatAddrLine(addrs: MailAddr[] | undefined): string {
  return (addrs || []).map((a) => (a.address ? `${a.name || ''} <${a.address}>`.trim() : a.name || '')).join(', ')
}

function formatAddrPlain(addrs: MailAddr[] | undefined): string {
  return (addrs || []).map((a) => a.address || a.name || '').join(', ')
}

function plaidApiBaseUrl(plaidEnv: string): string {
  if (plaidEnv === 'production') return 'https://production.plaid.com'
  if (plaidEnv === 'development') return 'https://development.plaid.com'
  return 'https://sandbox.plaid.com'
}

type MailListRow = {
  uid: number
  messageId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  seen: boolean
  hasAttachments: boolean
}

type ImapEnvelope = {
  messageId?: string
  subject?: string
  date?: Date | string
  from?: MailAddr[]
  to?: MailAddr[]
  cc?: MailAddr[]
  replyTo?: MailAddr[]
}

type ImapFetchMsg = {
  uid?: number
  envelope?: ImapEnvelope
  flags?: Set<string>
  bodyStructure?: { childNodes?: unknown[] }
  source?: Buffer
} | null

type ImapFlowClient = {
  connect: () => Promise<void>
  logout: () => Promise<void>
  getMailboxLock: (folder: string) => Promise<{ release: () => void }>
  mailbox?: { exists?: number }
  search: (q: Record<string, unknown>) => Promise<number[]>
  fetchOne: (uid: number, opts: Record<string, unknown>) => Promise<ImapFetchMsg>
  messageMove: (uid: number, target: string) => Promise<void>
  messageDelete: (uid: number) => Promise<void>
  list: () => Promise<Array<{ name: string; path: string; status?: { messages?: number; unseen?: number } }>>
}

type ImapFlowModule = { ImapFlow: new (opts: Record<string, unknown>) => ImapFlowClient }

type MailparserModule = {
  simpleParser: (src: Buffer | undefined) => Promise<{ text?: string; html?: string; attachments?: unknown[] }>
}

type NodemailerLike = {
  createTransport: (opts: Record<string, unknown>) => { sendMail: (opts: Record<string, unknown>) => Promise<{ messageId?: string }> }
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Upper bound for buffered proxy bodies (Whisper uploads, multipart image edits, voice PCM). */
const MAX_BODY_BYTES = 32 * 1024 * 1024

function isRequestBodyTooLargeError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('Request body exceeds maximum size')
}

function readBodyRaw(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    req.on('data', (c: Buffer) => {
      if (settled) return
      total += c.length
      if (total > MAX_BODY_BYTES) {
        settled = true
        req.destroy()
        reject(new Error(`Request body exceeds maximum size (${MAX_BODY_BYTES} bytes)`))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

function getOpenAiConfig(env: Record<string, string>): {
  key: string | undefined
  base: string
} {
  const key = env.OPENAI_API_KEY?.trim()
  const base =
    env.OPENAI_BASE_URL?.replace(/\/$/, '') ||
    env.VITE_OPENAI_BASE_URL?.replace(/\/$/, '') ||
    'https://api.openai.com/v1'
  return { key, base }
}

function getBearerFromReqHeader(req: Connect.IncomingMessage): string | null {
  const raw = req.headers.authorization?.trim()
  if (!raw) return null
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim()
  return null
}

function getXiApiKeyFromReqHeader(req: Connect.IncomingMessage): string | null {
  const raw = req.headers['xi-api-key'] ?? req.headers['x-elevenlabs-api-key']
  if (!raw) return null
  const s = Array.isArray(raw) ? raw[0] : raw
  const t = String(s).trim()
  return t || null
}

/** Max chars of upstream error detail exposed to the client (avoid echoing HTML blobs). */
const TTS_UPSTREAM_ERROR_MAX = 512

function safeTtsUpstreamMessage(raw: string, fallback: string): string {
  const t = raw
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TTS_UPSTREAM_ERROR_MAX)
  return t || fallback
}

/**
 * Pipes a `fetch()` Web ReadableStream to `res` and cancels the upstream reader when the
 * client disconnects (navigation, barge-in abort, tab close) so the remote stream does not
 * keep pumping indefinitely. Uses `pipeline` so `res.write()` backpressure is respected.
 */
function pipeWebReadableToResWithClientAbort(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  webStream: import('stream/web').ReadableStream
): void {
  const nodeReadable = Readable.fromWeb(webStream)
  function cleanup(reason: string) {
    req.removeListener('aborted', onAbort)
    res.removeListener('close', onResClose)
    if (res.writableEnded || nodeReadable.readableEnded) return
    if (!nodeReadable.destroyed) {
      nodeReadable.destroy(new Error(reason))
    }
    void webStream.cancel(reason).catch(() => {})
  }
  function onAbort() {
    cleanup('client aborted')
  }
  function onResClose() {
    if (!res.writableEnded) cleanup('client disconnected')
  }
  req.once('aborted', onAbort)
  res.once('close', onResClose)
  pipeline(nodeReadable, res, () => {
    req.removeListener('aborted', onAbort)
    res.removeListener('close', onResClose)
  })
}

const viteBookCache = new Map<string, { title: string; authors: string[]; fullText: string; fetchedAt: number }>()

function stripGutenbergBoilerplate(text: string): string {
  let content = text
  const startMatch = content.match(/\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i)
  if (startMatch?.index != null) {
    content = content.slice(startMatch.index + startMatch[0].length)
  }
  const endMatch = content.match(/\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK/i)
  if (endMatch?.index != null) {
    content = content.slice(0, endMatch.index)
  }
  content = content.replace(/^\s*(Produced by|Transcribed by|E-text prepared by)[^\n]*\n*/i, '')
  return content.trim()
}

const RETRYABLE_CODES = new Set([502, 503, 504])
async function fetchRetry(url: string, opts: RequestInit & { timeoutMs?: number } = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const ms = opts.timeoutMs || 15000
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const fetchOpts = { ...(opts as Record<string, unknown>) }
      delete fetchOpts.timeoutMs
      const res = await fetch(url, { ...fetchOpts, signal: ctrl.signal } as RequestInit)
      clearTimeout(timer)
      if (res.ok || !RETRYABLE_CODES.has(res.status) || attempt === retries) return res
    } catch (e) {
      clearTimeout(timer)
      if (attempt === retries) throw e
    }
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
  }
  return fetch(url, opts)
}

const defaultRealtimeSession = {
  session: {
    type: 'realtime' as const,
    model: 'gpt-realtime',
    audio: {
      output: { voice: 'marin' },
    },
  },
}

function mergeRealtimeSessionBody(raw: string): typeof defaultRealtimeSession {
  if (!raw.trim()) {
    return defaultRealtimeSession
  }
  try {
    const parsed = JSON.parse(raw) as { session?: unknown }
    if (parsed?.session && typeof parsed.session === 'object' && parsed.session !== null) {
      return {
        session: {
          ...defaultRealtimeSession.session,
          ...(parsed.session as Record<string, unknown>),
        } as (typeof defaultRealtimeSession)['session'],
      }
    }
  } catch {
    /* use default */
  }
  return defaultRealtimeSession
}

function attachProxy(getEnv: () => Record<string, string>, middlewares: Connect.Server) {
  middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const path = req.url?.split('?')[0]

    /** Electron-only: paste into foreground app (see electron/main.cjs). Dev browser has no OS keyboard access. */
    if (path === '/api/desktop/paste-text' && req.method === 'POST') {
      try {
        await readBody(req)
      } catch {
        /* ignore */
      }
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Desktop paste is only available in the Jarvis Electron desktop app (npm run desktop). In Vite dev, copy text manually or use the embedded browser tools.',
        })
      )
      return
    }

    if (path === '/api/desktop/clipboard-text' && req.method === 'GET') {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Reading the system clipboard requires the Jarvis Electron desktop app (npm run desktop).',
        })
      )
      return
    }

    if (path === '/api/desktop/screen-read' && req.method === 'POST') {
      try {
        await readBody(req)
      } catch {
        /* ignore */
      }
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Screen capture and reading requires the Jarvis Electron desktop app (npm run desktop) and OPENAI_API_KEY.',
        })
      )
      return
    }

    if (path === '/api/desktop/launch' && req.method === 'POST') {
      try {
        await readBody(req)
      } catch {
        /* ignore */
      }
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Launching desktop apps requires the Jarvis Electron desktop app (npm run desktop).',
        })
      )
      return
    }

    /** Foreground metadata for voice Realtime instructions — full data only in Electron; empty in Vite. */
    if (path === '/api/desktop/focus-context' && req.method === 'GET') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ activeApp: '', windowTitle: '', summary: '' }))
      return
    }

    /**
     * Electron proxies /api/vision/* to Jarvis Visual Engine :5000. Plain Vite dev has no engine —
     * return a minimal OK payload so voice mode gets hasVision and does not parrot "camera offline".
     */
    if (path === '/api/vision/context' && req.method === 'GET') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          connected: true,
          camera_connected: true,
          scene_description:
            'Vite dev placeholder: start Jarvis Visual Engine (port 5000) or use Electron (npm run desktop) for a live camera feed.',
          frames_processed: 0,
          last_updated: new Date().toISOString(),
        }),
      )
      return
    }

    if (path === '/api/vision/analyze' && req.method === 'POST') {
      try {
        await readBody(req)
      } catch {
        /* ignore */
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, stub: true }))
      return
    }

    /** Cheap check for voice UI — does not call OpenAI (unlike POST /api/realtime/session). */
    if (path === '/api/realtime/voice-ready' && req.method === 'GET') {
      const env = getEnv()
      const { key } = getOpenAiConfig(env)
      if (!key) {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: {
              message:
                'Missing OPENAI_API_KEY. Add it to .env (dev/preview proxy only) and restart `npm run dev`.',
            },
          })
        )
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (path === '/api/realtime/session' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: {
              message:
                'Missing OPENAI_API_KEY. Add it to .env (used only by the dev/preview proxy, not shipped to the browser).',
            },
          })
        )
        return
      }

      try {
        const rawBody = await readBody(req)
        const bodyJson = mergeRealtimeSessionBody(rawBody)
        const upstream = await fetch(`${base}/realtime/client_secrets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(bodyJson),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: { message: e instanceof Error ? e.message : 'Proxy error' },
          })
        )
      }
      return
    }

    if (path === '/api/wake-word' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY for wake word transcription.' } }))
        return
      }
      try {
        const rawBody = await readBodyRaw(req)
        const contentType = req.headers['content-type'] || ''
        const upstream = await fetch(`${base}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': contentType,
          },
          body: rawBody,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        if (isRequestBodyTooLargeError(e)) {
          res.statusCode = 413
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Request body too large' } }))
          return
        }
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Wake word proxy error' } }))
      }
      return
    }

    // ── Image generation ──
    if (path === '/api/images/generate' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
      try {
        const body = await readBody(req)
        const upstream = await fetch(`${base}/images/generations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Image generation proxy error' } }))
      }
      return
    }

    // ── Image editing ──
    if (path === '/api/images/edit' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
      try {
        const rawBody = await readBodyRaw(req)
        const contentType = req.headers['content-type'] || ''
        const upstream = await fetch(`${base}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
          body: rawBody,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        if (isRequestBodyTooLargeError(e)) {
          res.statusCode = 413
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Request body too large' } }))
          return
        }
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Image edit proxy error' } }))
      }
      return
    }

    // ── Video creation ──
    if (path === '/api/videos/create' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
      try {
        const body = await readBody(req)
        const upstream = await fetch(`${base}/videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video creation proxy error' } }))
      }
      return
    }

    // ── Video status polling ──
    if (path === '/api/videos/status' && req.method === 'GET') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
      const videoId = new URL(req.url || '', 'http://localhost').searchParams.get('id')
      if (!videoId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing id parameter.' } })); return }
      try {
        const upstream = await fetch(`${base}/videos/${encodeURIComponent(videoId)}`, {
          headers: { Authorization: `Bearer ${key}` },
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video status proxy error' } }))
      }
      return
    }

    // ── Video content download ──
    if (path === '/api/videos/content' && req.method === 'GET') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
      const videoId = new URL(req.url || '', 'http://localhost').searchParams.get('id')
      if (!videoId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing id parameter.' } })); return }
      try {
        const upstream = await fetch(`${base}/videos/${encodeURIComponent(videoId)}/content`, {
          headers: { Authorization: `Bearer ${key}` },
        })
        res.statusCode = upstream.status
        const ct = upstream.headers.get('content-type')
        if (ct) res.setHeader('Content-Type', ct)
        const cl = upstream.headers.get('content-length')
        if (cl) res.setHeader('Content-Length', cl)
        if (upstream.body) {
          const reader = upstream.body.getReader()
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read()
              if (done) { res.end(); return }
              res.write(value)
            }
          }
          await pump()
        } else {
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.end(buf)
        }
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video content proxy error' } }))
      }
      return
    }

    // ── DigitalOcean model catalog (dev proxy) ──
    if (path === '/api/digitalocean/models' && req.method === 'GET') {
      const env = getEnv()
      const doKey = (env.DIGITALOCEAN_API_KEY || env.VITE_DIGITALOCEAN_API_KEY || '').trim()
      const fromClient = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim()
      const token = fromClient || doKey
      if (!token) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing DigitalOcean API key.' } }))
        return
      }
      try {
        const upstream = await fetch('https://inference.do-ai.run/v1/models', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        const text = await upstream.text()
        if (!upstream.ok) {
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
          return
        }
        const raw = JSON.parse(text) as { data?: Array<{ id: string; owned_by?: string }> }
        const models = (raw.data || []).map((m) => ({
          id: m.id,
          name: m.id.replace(/^[^/]+\//, ''),
          description: m.owned_by ? `by ${m.owned_by}` : 'DigitalOcean serverless model',
        }))
        models.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ models, meta: { count: models.length } }))
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'DO models proxy error' } }))
      }
      return
    }

    // ── DigitalOcean LLM proxy (dev proxy) ──
    if (path === '/api/llm' && req.method === 'POST' && (req.headers['x-llm-provider'] || '').toLowerCase() === 'digitalocean') {
      const env = getEnv()
      const doKey = (env.DIGITALOCEAN_API_KEY || env.VITE_DIGITALOCEAN_API_KEY || '').trim()
      const fromClient = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim()
      const token = fromClient || doKey
      if (!token) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing DigitalOcean API key for inference.' } }))
        return
      }
      try {
        const bodyRaw = await readBody(req)
        const body = llmChatBody.normalizeLlmChatCompletionBody(bodyRaw, env, 'digitalocean')
        const upstream = await fetch('https://inference.do-ai.run/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'DO inference proxy error' } }))
      }
      return
    }

    // ── ElevenLabs voice library (dev proxy) ──
    if (path === '/api/elevenlabs/my-voices' && req.method === 'GET') {
      const env = getEnv()
      const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
      if (!elKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY' } }))
        return
      }
      try {
        const upstream = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elKey } })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs voices error' } }))
      }
      return
    }

    if (path === '/api/elevenlabs/voices' && req.method === 'GET') {
      const env = getEnv()
      const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
      if (!elKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY' } }))
        return
      }
      try {
        const rawQuery = (req.url || '').split('?')[1] || ''
        const query = elevenLabsSharedVoices.buildAllowedElevenLabsSharedVoicesQuery(rawQuery)
        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/shared-voices${query ? `?${query}` : ''}`,
          { headers: { 'xi-api-key': elKey } },
        )
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs shared voices error' } }))
      }
      return
    }

    // ── ElevenLabs sound effects (dev proxy) ──
    if (path === '/api/elevenlabs/sound-effect' && req.method === 'POST') {
      const env = getEnv()
      const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
      if (!elKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY' } }))
        return
      }
      try {
        const body = await readBody(req)
        const parsed = JSON.parse(body)
        const upstream = await fetch(
          'https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': elKey },
            body: JSON.stringify({
              text: parsed.text,
              duration_seconds: parsed.duration_seconds || null,
              prompt_influence: parsed.prompt_influence ?? 0.5,
              model_id: 'eleven_text_to_sound_v2',
            }),
          },
        )
        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => upstream.statusText)
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: {
                message: safeTtsUpstreamMessage(String(errText), `ElevenLabs error (${upstream.status})`),
              },
            })
          )
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'audio/pcm')
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.end(buf)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Sound effect error' } }))
      }
      return
    }

    // ── ElevenLabs streaming TTS (PCM) — matches `handleElevenLabsStreamingTts` in electron/main.cjs
    if (path === '/api/elevenlabs-tts' && req.method === 'POST') {
      const env = getEnv()
      const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
      if (!elKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY' } }))
        return
      }
      try {
        const bodyStr = await readBody(req)
        const body = JSON.parse(bodyStr) as {
          text?: string
          voice_id?: string
          model_id?: string
          voice_settings?: Record<string, unknown>
        }
        const text = String(body.text || '').trim()
        if (!text) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Empty text' } }))
          return
        }
        const voiceId =
          String(body.voice_id || '').trim() ||
          (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim() ||
          'pNInz6obpgDQGcFmaJgB'

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_24000&optimize_streaming_latency=3`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elKey,
            },
            body: JSON.stringify({
              text,
              model_id: body.model_id || 'eleven_turbo_v2_5',
              voice_settings: body.voice_settings || {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0,
                use_speaker_boost: true,
              },
            }),
          },
        )

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => upstream.statusText)
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: {
                message: safeTtsUpstreamMessage(String(errText), `ElevenLabs error (${upstream.status})`),
              },
            })
          )
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'audio/pcm')
        if (upstream.body) {
          pipeWebReadableToResWithClientAbort(req, res, upstream.body as import('stream/web').ReadableStream)
        } else {
          res.end()
        }
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: {
              message: safeTtsUpstreamMessage(
                e instanceof Error ? e.message : 'ElevenLabs TTS error',
                'ElevenLabs TTS error'
              ),
            },
          })
        )
      }
      return
    }

    // ── POST /api/tts — OpenAI audio/speech or ElevenLabs (matches `handleTtsProxy` in electron/main.cjs) ──
    if (path === '/api/tts' && req.method === 'POST') {
      const env = getEnv()
      const bodyStr = await readBody(req)
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(bodyStr) as Record<string, unknown>
      } catch {
        parsed = null
      }

      if (parsed?.provider === 'elevenlabs') {
        const xiKey =
          getXiApiKeyFromReqHeader(req) ||
          (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
        const voiceId =
          String(parsed.voice_id || '').trim() ||
          (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim()
        if (!xiKey || !voiceId) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('X-Tts-Unavailable', 'missing-elevenlabs-config')
          res.end(
            JSON.stringify({
              error: {
                message:
                  'ElevenLabs TTS requires an API key and voice ID (Settings → API Keys, or ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in .env).',
              },
            })
          )
          return
        }
        const text = String(parsed.text || '').trim().slice(0, 5000)
        if (!text) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: { message: 'Empty text' } }))
          return
        }
        const modelId = String(
          parsed.model_id || env.ELEVENLABS_MODEL_ID || env.VITE_ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
        ).trim()
        try {
          const upstream = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': xiKey,
                Accept: 'audio/mpeg',
              },
              body: JSON.stringify({ text, model_id: modelId }),
            }
          )
          if (!upstream.ok) {
            const errText = await upstream.text()
            let msg = 'ElevenLabs TTS error'
            try {
              const j = JSON.parse(errText) as { detail?: string; message?: string }
              const raw = typeof j.detail === 'string' ? j.detail : j.message
              msg = safeTtsUpstreamMessage(typeof raw === 'string' ? raw : '', msg)
            } catch {
              msg = safeTtsUpstreamMessage(errText, msg)
            }
            res.statusCode = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: { message: msg } }))
            return
          }
          const ct = upstream.headers.get('content-type') || 'audio/mpeg'
          res.statusCode = upstream.status
          res.setHeader('Content-Type', ct)
          if (upstream.body) {
            pipeWebReadableToResWithClientAbort(req, res, upstream.body as import('stream/web').ReadableStream)
          } else {
            const buf = await upstream.arrayBuffer()
            res.end(Buffer.from(buf))
          }
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              error: {
                message: safeTtsUpstreamMessage(
                  e instanceof Error ? e.message : 'ElevenLabs TTS proxy error',
                  'ElevenLabs TTS proxy error'
                ),
              },
            })
          )
        }
        return
      }

      const normalized = openaiTtsSpeechBody.normalizeOpenAiAudioSpeechBody(bodyStr)
      if (!normalized.ok) {
        res.statusCode = normalized.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: { message: normalized.message } }))
        return
      }

      const fromClient = getBearerFromReqHeader(req)
      const key =
        (fromClient ? fromClient : '') || (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
      if (!key) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('X-Tts-Unavailable', 'missing-openai-key')
        res.end(
          JSON.stringify({
            error: {
              message:
                'TTS requires an OpenAI API key: add OPENAI_API_KEY to .env or paste your key in Settings → API Keys.',
            },
          })
        )
        return
      }

      const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
      try {
        const upstream = await fetch(`${base}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: normalized.body,
        })
        if (!upstream.ok) {
          const text = await upstream.text()
          let msg = 'OpenAI TTS request failed'
          try {
            const j = JSON.parse(text) as { error?: { message?: string }; message?: string }
            const raw = j.error?.message || j.message || ''
            msg = safeTtsUpstreamMessage(String(raw), msg)
          } catch {
            msg = safeTtsUpstreamMessage(text, msg)
          }
          res.statusCode = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: { message: msg } }))
          return
        }
        const ct = upstream.headers.get('content-type') || 'audio/mpeg'
        res.statusCode = upstream.status
        res.setHeader('Content-Type', ct)
        if (upstream.body) {
          pipeWebReadableToResWithClientAbort(req, res, upstream.body as import('stream/web').ReadableStream)
        } else {
          const buf = await upstream.arrayBuffer()
          res.end(Buffer.from(buf))
        }
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error: {
              message: safeTtsUpstreamMessage(e instanceof Error ? e.message : 'TTS proxy error', 'TTS proxy error'),
            },
          })
        )
      }
      return
    }

    // ── Voice analysis proxy (Python microservice) ──
    if (path === '/api/voice-analysis' && req.method === 'POST') {
      try {
        const rawBody = await readBodyRaw(req)
        const upstream = await fetch('http://localhost:5199/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: rawBody,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch (e) {
        if (isRequestBodyTooLargeError(e)) {
          res.statusCode = 413
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Request body too large' } }))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Voice analysis service unavailable', vocalState: 'Unable to analyse voice' }))
      }
      return
    }

    // ── X (Twitter) API proxy ──
    if (path === '/api/x/tweet' && req.method === 'POST') {
      const env = getEnv()
      const apiKey = (env.X_API_KEY || '').trim()
      const apiSecret = (env.X_API_SECRET || '').trim()
      const accessToken = (env.X_ACCESS_TOKEN || '').trim()
      const accessTokenSecret = (env.X_ACCESS_TOKEN_SECRET || '').trim()
      if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
        res.statusCode = 401; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing X API credentials' } })); return
      }
      try {
        const body = JSON.parse(await readBody(req))
        const OAuth = (await import('oauth-1.0a')).default
        const CryptoJS = (await import('crypto-js')).default
        const oauth = OAuth({
          consumer: { key: apiKey, secret: apiSecret },
          signature_method: 'HMAC-SHA1',
          hash_function(baseString: string, key: string) { return CryptoJS.HmacSHA1(baseString, key).toString(CryptoJS.enc.Base64) },
        })
        const token = { key: accessToken, secret: accessTokenSecret }
        const url = 'https://api.twitter.com/2/tweets'
        const oauthHeader = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, token))
        const upstream = await fetch(url, {
          method: 'POST',
          headers: { ...oauthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) {
        res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: (e as Error).message } }))
      }
      return
    }

    // ── Plaid API proxy ──
    const plaidRoute = async (endpoint: string) => {
      const env = getEnv()
      const clientId = (env.PLAID_CLIENT_ID || '').trim()
      const secret = (env.PLAID_SECRET || '').trim()
      const plaidEnv = (env.PLAID_ENV || 'sandbox').trim()
      const base = plaidApiBaseUrl(plaidEnv)
      if (!clientId || !secret) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing PLAID_CLIENT_ID or PLAID_SECRET' } })); return }
      const reqBody = req.method === 'POST' ? JSON.parse(await readBody(req) || '{}') : {}
      const upstream = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, ...reqBody }),
      })
      const text = await upstream.text()
      res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
    }

    if (path === '/api/plaid/link-token' && req.method === 'POST') {
      try {
        const env = getEnv()
        const clientId = (env.PLAID_CLIENT_ID || '').trim()
        const secret = (env.PLAID_SECRET || '').trim()
        const plaidEnv = (env.PLAID_ENV || 'sandbox').trim()
        const base = plaidApiBaseUrl(plaidEnv)
        if (!clientId || !secret) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing PLAID_CLIENT_ID or PLAID_SECRET' } })); return }
        const upstream = await fetch(`${base}/link/token/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, user: { client_user_id: 'jarvis-user-1' }, client_name: 'Jarvis AI', products: ['transactions'], country_codes: ['GB', 'US'], language: 'en' }),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/plaid/exchange' && req.method === 'POST') {
      try { await plaidRoute('/item/public_token/exchange') } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/plaid/accounts' && req.method === 'POST') {
      const env = getEnv()
      const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
      if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked.' } })); return }
      try { await plaidRoute('/accounts/get') } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/plaid/balances' && req.method === 'POST') {
      const env = getEnv()
      const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
      if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked.' } })); return }
      try { await plaidRoute('/accounts/balance/get') } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/plaid/transactions' && req.method === 'POST') {
      const env = getEnv()
      const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
      if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked.' } })); return }
      try {
        const body = JSON.parse(await readBody(req) || '{}')
        const now = new Date()
        const endDate = body.end_date || now.toISOString().slice(0, 10)
        const startDate = body.start_date || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
        const clientId = (env.PLAID_CLIENT_ID || '').trim()
        const secret = (env.PLAID_SECRET || '').trim()
        const plaidEnv = (env.PLAID_ENV || 'sandbox').trim()
        const base = plaidApiBaseUrl(plaidEnv)
        const upstream = await fetch(`${base}/transactions/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken, start_date: startDate, end_date: endDate, options: { count: 100, offset: 0 } }),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    // ── Email IMAP/SMTP proxy ──
    if (path?.startsWith('/api/email/') && req.method === 'POST') {
      const env = getEnv()
      const emailAction = path.replace('/api/email/', '')
      const body = JSON.parse(await readBody(req) || '{}')

      const acctId = (body.account || env.EMAIL_1_ADDRESS || '').trim()
      let emailAddr = ''
      let emailPass = ''
      const imapHost = (env.EMAIL_IMAP_HOST || 'mail.livemail.co.uk').trim()
      const imapPort = parseInt(env.EMAIL_IMAP_PORT || '993', 10)
      const smtpHost = (env.EMAIL_SMTP_HOST || 'smtp.livemail.co.uk').trim()
      const smtpPort = parseInt(env.EMAIL_SMTP_PORT || '465', 10)

      if (acctId === (env.EMAIL_2_ADDRESS || '').trim()) {
        emailAddr = (env.EMAIL_2_ADDRESS || '').trim()
        emailPass = (env.EMAIL_2_PASSWORD || '').trim()
      } else {
        emailAddr = (env.EMAIL_1_ADDRESS || '').trim()
        emailPass = (env.EMAIL_1_PASSWORD || '').trim()
      }

      if (!emailAddr || !emailPass) {
        res.statusCode = 401; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Email credentials not configured. Set EMAIL_1_ADDRESS and EMAIL_1_PASSWORD in .env' } }))
        return
      }

      try {
        const { ImapFlow } = await import('imapflow') as ImapFlowModule

        if (emailAction === 'inbox' || emailAction === 'search') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const folder = body.folder || 'INBOX'
          const lock = await client.getMailboxLock(folder)
          try {
            const limit = body.limit || 20
            let msgUids: number[]
            if (emailAction === 'search' && body.query) {
              msgUids = (await client.search({ or: [{ subject: body.query }, { from: body.query }, { body: body.query }] })) as number[]
              msgUids = msgUids.slice(-limit).reverse()
            } else {
              const total = client.mailbox?.exists || 0
              const from = Math.max(1, total - limit + 1)
              msgUids = (await client.search({ seq: `${from}:*` })) as number[]
              msgUids = msgUids.reverse()
            }
            const messages: MailListRow[] = []
            for (const uid of msgUids.slice(0, limit)) {
              const msg = await client.fetchOne(uid, { envelope: true, bodyStructure: true, flags: true })
              if (!msg) continue
              const env2 = msg.envelope || {}
              messages.push({
                uid: msg.uid || uid,
                messageId: env2.messageId || '',
                from: formatAddrLine(env2.from),
                to: formatAddrLine(env2.to),
                subject: env2.subject || '(no subject)',
                date: env2.date ? new Date(env2.date).toISOString() : '',
                snippet: '',
                seen: (msg.flags || new Set()).has('\\Seen'),
                hasAttachments: !!(msg.bodyStructure?.childNodes?.length),
              })
            }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ messages }))
          } finally { lock.release(); await client.logout() }
          return
        }

        if (emailAction === 'read') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const lock = await client.getMailboxLock(body.folder || 'INBOX')
          try {
            const msg = await client.fetchOne(body.uid, { envelope: true, source: true, flags: true, bodyStructure: true })
            if (!msg) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Message not found' } })); return }
            const { simpleParser } = await import('mailparser') as MailparserModule
            const parsed = await simpleParser(msg.source)
            const env2 = msg.envelope || {}
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              message: {
                uid: msg.uid || body.uid,
                messageId: env2.messageId || '',
                from: formatAddrLine(env2.from),
                to: formatAddrLine(env2.to),
                cc: formatAddrPlain(env2.cc),
                subject: env2.subject || '(no subject)',
                date: env2.date ? new Date(env2.date).toISOString() : '',
                body: parsed.text || parsed.html?.replace(/<[^>]+>/g, '') || '(empty)',
                replyTo: formatAddrPlain(env2.replyTo),
                seen: (msg.flags || new Set()).has('\\Seen'),
                hasAttachments: (parsed.attachments || []).length > 0,
                snippet: (parsed.text || '').slice(0, 200),
              },
            }))
          } finally { lock.release(); await client.logout() }
          return
        }

        if (emailAction === 'send') {
          const nodemailerRaw = await import('nodemailer') as unknown as NodemailerLike & { default?: NodemailerLike }
          const nodemailer = nodemailerRaw.default ?? nodemailerRaw
          const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: true, auth: { user: emailAddr, pass: emailPass } })
          const mailOpts: Record<string, unknown> = { from: emailAddr, to: body.to, subject: body.subject, text: body.body }
          if (body.replyToMessageId) mailOpts.inReplyTo = body.replyToMessageId
          const info = await transporter.sendMail(mailOpts)
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, messageId: info.messageId }))
          return
        }

        if (emailAction === 'folders') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const boxes = await client.list()
          await client.logout()
          const folders = boxes.map((b) => ({ name: b.name, path: b.path, messageCount: b.status?.messages || 0, unseen: b.status?.unseen || 0 }))
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ folders }))
          return
        }

        if (emailAction === 'move') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const lock = await client.getMailboxLock(body.folder || 'INBOX')
          try { await client.messageMove(body.uid, body.targetFolder) } finally { lock.release(); await client.logout() }
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (emailAction === 'delete') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const lock = await client.getMailboxLock(body.folder || 'INBOX')
          try { await client.messageDelete(body.uid) } finally { lock.release(); await client.logout() }
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (emailAction === 'mark-read') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const lock = await client.getMailboxLock(body.folder || 'INBOX')
          try {
            if (body.read) { await client.messageFlagsAdd(body.uid, ['\\Seen']) }
            else { await client.messageFlagsRemove(body.uid, ['\\Seen']) }
          } finally { lock.release(); await client.logout() }
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 404; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: `Unknown email action: ${emailAction}` } }))
      } catch (e) {
        res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: (e as Error).message } }))
      }
      return
    }

    // ── Vonage SMS proxy ──
    if (path === '/api/vonage/sms' && req.method === 'POST') {
      try {
        const env = getEnv()
        const apiKey = (env.VONAGE_API_KEY || '').trim()
        const apiSecret = (env.VONAGE_API_SECRET || '').trim()
        const fromId = (env.VONAGE_FROM || '').trim()
        if (!apiKey || !apiSecret || !fromId) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Vonage not configured. Set VONAGE_API_KEY, VONAGE_API_SECRET, and VONAGE_FROM in .env' } }))
          return
        }
        const body = JSON.parse(await readBody(req) || '{}') as { to?: string; text?: string }
        const rawTo = (body.to || '').trim()
        const text = (body.text || '').trim()
        if (!rawTo || !text) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Missing "to" or "text"' } }))
          return
        }
        if (text.length > 1000) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'SMS text too long (max 1000 characters)' } }))
          return
        }
        const digits = vonageShared.normalizeVonagePhoneDigits(rawTo)
        if (digits.length < 8 || digits.length > 15) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Invalid phone number. Use international format (e.g. +447700900123).' } }))
          return
        }
        const upstream = await fetch('https://rest.nexmo.com/sms/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            api_secret: apiSecret,
            to: digits,
            from: fromId,
            text,
          }),
        })
        const data = await upstream.json() as { messages?: Array<{ status?: string; 'message-id'?: string; to?: string; 'error-text'?: string }> }
        const msg = data.messages?.[0]
        if (!msg || msg.status !== '0') {
          const errText = msg?.['error-text'] || `Vonage status ${msg?.status ?? 'unknown'}`
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: errText } }))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, messageId: msg['message-id'], to: msg.to || digits }))
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: (e as Error).message } }))
      }
      return
    }

    // ── Vonage Voice (outbound TTS call) ──
    if (path === '/api/vonage/call' && req.method === 'POST') {
      try {
        const env = getEnv()
        const appId = (env.VONAGE_APPLICATION_ID || '').trim()
        const privateKeyPem = vonageShared.loadVonagePrivateKeyPem(env)
        const fromRaw = (env.VONAGE_FROM || '').trim()
        if (!appId || !privateKeyPem || !fromRaw) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: {
              message:
                'Vonage Voice not configured. Create a Voice application at dashboard.nexmo.com, set VONAGE_APPLICATION_ID and VONAGE_PRIVATE_KEY (or VONAGE_PRIVATE_KEY_BASE64), and VONAGE_FROM (your Vonage number).',
            },
          }))
          return
        }
        const body = JSON.parse(await readBody(req) || '{}') as {
          to?: string
          text?: string
          language?: string
          mode?: string
          aiVoice?: boolean
        }
        const rawTo = (body.to || '').trim()
        const aiMode = body.mode === 'ai_voice' || body.aiVoice === true
        const text = (body.text || '').trim()
        if (!rawTo) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Missing "to"' } }))
          return
        }
        if (!aiMode && !text) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Missing "text" (or use mode: "ai_voice" for live AI audio).' } }))
          return
        }
        if (!aiMode && text.length > 3000) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Spoken text too long (max 3000 characters)' } }))
          return
        }
        const toDigits = vonageShared.normalizeVonagePhoneDigits(rawTo)
        if (toDigits.length < 8 || toDigits.length > 15) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'Invalid phone number. Use international format (e.g. +447700900123).' } }))
          return
        }
        const fromDigits = fromRaw.replace(/\D/g, '')
        if (fromDigits.length < 8 || fromDigits.length > 15) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'VONAGE_FROM must be your Vonage phone number (E.164 digits) for Voice calls.' } }))
          return
        }
        const jwt = tokenGenerate(appId, privateKeyPem)
        const lang = (body.language || 'en-GB').trim()
        let ncco: Array<Record<string, unknown>>
        if (aiMode) {
          const wsUri = vonageShared.buildVonageAiVoiceWebSocketUri(env)
          if (!wsUri) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              error: {
                message:
                  'AI voice calls need VONAGE_PUBLIC_WS_URL (public wss:// URL to the media bridge, e.g. ngrok → local VONAGE_AI_VOICE_PORT) and the bridge running.',
              },
            }))
            return
          }
          ncco = [
            {
              action: 'connect',
              endpoint: [
                {
                  type: 'websocket',
                  uri: wsUri,
                  'content-type': 'audio/l16;rate=16000',
                },
              ],
            },
          ]
        } else {
          ncco = [
            {
              action: 'talk',
              text,
              language: lang,
            },
          ]
        }
        const upstream = await fetch('https://api.nexmo.com/v1/calls', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: [{ type: 'phone', number: toDigits }],
            from: { type: 'phone', number: fromDigits },
            ncco,
          }),
        })
        const rawText = await upstream.text()
        let data: { uuid?: string; message?: string; type?: string } = {}
        try {
          data = JSON.parse(rawText) as typeof data
        } catch {
          /* not json */
        }
        if (!upstream.ok) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: data.message || rawText.slice(0, 200) || `HTTP ${String(upstream.status)}` } }))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, callUuid: data.uuid, to: toDigits, mode: aiMode ? 'ai_voice' : 'tts' }))
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: (e as Error).message } }))
      }
      return
    }

    // ── Story library proxy ──
    if (path === '/api/stories/search' && req.method === 'GET') {
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const q = params.get('q') || ''
      const source = params.get('source') || 'all'
      const limit = parseInt(params.get('limit') || '10', 10)
      const results: Array<{ id: string; title: string; authors: string[]; source: string; subjects?: string[]; snippet?: string }> = []
      try {
        if (source === 'all' || source === 'gutenberg') {
          const gutRes = await fetchRetry(`https://gutendex.com/books?search=${encodeURIComponent(q)}`, { timeoutMs: 10000 })
          if (gutRes.ok) {
            const gutData = await gutRes.json() as { results: Array<{ id: number; title: string; authors: Array<{ name: string }>; subjects: string[] }> }
            for (const b of (gutData.results || []).slice(0, limit)) {
              results.push({ id: String(b.id), title: b.title, authors: (b.authors || []).map(a => a.name), source: 'gutenberg', subjects: (b.subjects || []).slice(0, 5) })
            }
          }
        }
        if (source === 'all' || source === 'short') {
          let hfOk = false
          try {
            const ctrl = new AbortController()
            const timeout = setTimeout(() => ctrl.abort(), 8000)
            const hfRes = await fetch(`https://datasets-server.huggingface.co/search?dataset=roneneldan/TinyStories&config=default&split=train&query=${encodeURIComponent(q)}&offset=0&length=${Math.min(limit, 20)}`, {
              signal: ctrl.signal,
            })
            clearTimeout(timeout)
            if (hfRes.ok) {
              const hfData = await hfRes.json() as { rows: Array<{ row_idx: number; row: { text: string } }> }
              for (const row of (hfData.rows || []).slice(0, limit)) {
                const text = row.row?.text || ''
                results.push({ id: `hf-tinystories-${row.row_idx}`, title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], source: 'huggingface', snippet: text.slice(0, 200) })
              }
              hfOk = true
            }
          } catch { /* search endpoint flaky */ }

          if (!hfOk) {
            try {
              const offset = randomInt(2_000_000)
              const fallbackRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${offset}&length=${Math.min(limit, 10)}`)
              if (fallbackRes.ok) {
                const fbData = await fallbackRes.json() as { rows: Array<{ row_idx: number; row: { text: string } }> }
                for (const row of (fbData.rows || []).slice(0, limit)) {
                  const text = row.row?.text || ''
                  results.push({ id: `hf-tinystories-${row.row_idx}`, title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], source: 'huggingface', snippet: text.slice(0, 200) })
                }
              }
            } catch { /* ignore */ }
          }
        }
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ results }))
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/stories/content' && req.method === 'GET') {
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const id = params.get('id') || ''
      const source = params.get('source') || 'gutenberg'
      const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10))
      try {
        if (source === 'gutenberg') {
          let cached = viteBookCache.get(`gutenberg:${id}`)
          if (!cached || Date.now() - cached.fetchedAt > 30 * 60 * 1000) {
            const metaRes = await fetchRetry(`https://gutendex.com/books/${id}`, { timeoutMs: 10000 })
            if (!metaRes.ok) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Book not found' } })); return }
            const meta = await metaRes.json() as { title: string; authors: Array<{ name: string }>; formats: Record<string, string> }
            const textUrl = meta.formats?.['text/plain; charset=utf-8'] || meta.formats?.['text/plain'] || meta.formats?.['text/plain; charset=us-ascii'] || ''
            if (!textUrl) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No plain text available' } })); return }
            const textRes = await fetchRetry(textUrl, { timeoutMs: 20000 })
            const rawText = await textRes.text()
            const fullText = stripGutenbergBoilerplate(rawText)
            if (viteBookCache.size >= 20) {
              const oldest = [...viteBookCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]
              if (oldest) viteBookCache.delete(oldest[0])
            }
            cached = { title: meta.title, authors: (meta.authors || []).map((a: { name: string }) => a.name), fullText, fetchedAt: Date.now() }
            viteBookCache.set(`gutenberg:${id}`, cached)
          }
          const pageSize = 4000
          const totalPages = Math.ceil(cached.fullText.length / pageSize)
          const p = Math.max(1, Math.min(page, totalPages))
          const start = (p - 1) * pageSize
          const content = cached.fullText.slice(start, start + pageSize)
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ title: cached.title, authors: cached.authors, content, page: p, totalPages, totalChars: cached.fullText.length, hasMore: p < totalPages, truncated: p < totalPages }))
        } else {
          const rowIdx = id.replace('hf-tinystories-', '')
          const hfCtrl = new AbortController()
          const hfTimer = setTimeout(() => hfCtrl.abort(), 10000)
          const hfRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${rowIdx}&length=1`, { signal: hfCtrl.signal })
          clearTimeout(hfTimer)
          if (!hfRes.ok) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Story not found' } })); return }
          const hfData = await hfRes.json() as { rows: Array<{ row: { text: string } }> }
          const text = hfData.rows?.[0]?.row?.text || ''
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], content: text, page: 1, totalPages: 1, totalChars: text.length, hasMore: false, truncated: false }))
        }
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/stories/random' && req.method === 'GET') {
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const genre = params.get('genre') || ''
      try {
        const topics = ['adventure', 'fairy tale', 'mystery', 'fantasy', 'fable', 'science fiction', 'romance', 'horror'] as const
        const topic = genre || topics[randomInt(topics.length)]

        try {
          const gutRes = await fetchRetry(`https://gutendex.com/books?topic=${encodeURIComponent(topic)}&page=${randomInt(3) + 1}`, { timeoutMs: 10000 })
          if (gutRes.ok) {
            const gutData = await gutRes.json() as { results: Array<{ id: number; title: string; authors: Array<{ name: string }>; formats: Record<string, string> }> }
            const books = gutData.results || []
            if (books.length > 0) {
              const book = books[randomInt(books.length)]
              const textUrl = book.formats?.['text/plain; charset=utf-8'] || book.formats?.['text/plain'] || ''
              let content = '(Full text not available in plain text format.)'
              let hasMore = false
              let totalPages = 1
              if (textUrl) {
                const textRes = await fetchRetry(textUrl, { timeoutMs: 15000 })
                const rawText = await textRes.text()
                const fullText = stripGutenbergBoilerplate(rawText)
                const bkAuthors = (book.authors || []).map((a: { name: string }) => a.name)
                if (viteBookCache.size >= 20) {
                  const oldest = [...viteBookCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]
                  if (oldest) viteBookCache.delete(oldest[0])
                }
                viteBookCache.set(`gutenberg:${book.id}`, { title: book.title, authors: bkAuthors, fullText, fetchedAt: Date.now() })
                const pageSize = 4000
                totalPages = Math.ceil(fullText.length / pageSize)
                content = fullText.slice(0, pageSize)
                hasMore = totalPages > 1
              }
              res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ title: book.title, authors: (book.authors || []).map((a: { name: string }) => a.name), content, source: 'gutenberg', bookId: String(book.id), page: 1, totalPages, hasMore }))
              return
            }
          }
        } catch { /* Gutenberg timed out — fall through to HF */ }

        const offsetR = randomInt(2_000_000)
        const hfRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${offsetR}&length=1`)
        if (hfRes.ok) {
          const hfData = await hfRes.json() as { rows: Array<{ row: { text: string } }> }
          const text = hfData.rows?.[0]?.row?.text || ''
          if (text) {
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], content: text, source: 'huggingface' }))
            return
          }
        }

        res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No random story found.' } }))
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    // ── Suno API proxy ──
    if (path === '/api/suno/generate' && req.method === 'POST') {
      const env = getEnv()
      const sunoKey = (env.SUNO_API_KEY || env.VITE_SUNO_API_KEY || '').trim()
      if (!sunoKey) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing SUNO_API_KEY' } })); return }
      try {
        const raw = await readBody(req)
        const parsed = JSON.parse(raw)
        const body = sunoGenerateBody.buildAllowedSunoGenerateBody(parsed)
        const upstream = await fetch('https://api.sunoapi.org/api/v1/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sunoKey}` },
          body: JSON.stringify(body),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/suno/status' && req.method === 'GET') {
      const env = getEnv()
      const sunoKey = (env.SUNO_API_KEY || env.VITE_SUNO_API_KEY || '').trim()
      if (!sunoKey) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing SUNO_API_KEY' } })); return }
      const taskId = new URL(req.url || '', 'http://localhost').searchParams.get('taskId')
      if (!taskId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing taskId' } })); return }
      try {
        const upstream = await fetch(`https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${sunoKey}` },
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    // ── Hugging Face API proxy ──
    if (path === '/api/huggingface/search' && req.method === 'GET') {
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const q = params.get('q') || ''
      const type = params.get('type') || 'datasets'
      const limit = params.get('limit') || '10'
      try {
        const upstream = await fetch(`https://huggingface.co/api/${encodeURIComponent(type)}?search=${encodeURIComponent(q)}&limit=${limit}&sort=downloads&direction=-1`, {
          headers: { Accept: 'application/json' },
        })
        const data = await upstream.json() as Array<{ id?: string; modelId?: string; description?: string; downloads?: number; pipeline_tag?: string }>
        const results = (Array.isArray(data) ? data : []).map(d => ({
          id: d.id || d.modelId || '',
          description: d.description || d.pipeline_tag || '',
          downloads: d.downloads || 0,
          pipeline_tag: d.pipeline_tag || '',
        }))
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ results }))
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/huggingface/dataset-sample' && req.method === 'GET') {
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const dataset = params.get('dataset') || ''
      const split = params.get('split') || 'train'
      const config = params.get('config') || 'default'
      try {
        const upstream = await fetch(`https://datasets-server.huggingface.co/first-rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}`, {
          headers: { Accept: 'application/json' },
        })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    // ── GitHub API proxy ──
    if (path === '/api/github/search' && req.method === 'GET') {
      const env = getEnv()
      const ghToken = (env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || '').trim()
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const q = params.get('q') || ''
      const type = params.get('type') || 'repositories'
      const limit = params.get('limit') || '10'
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Jarvis-AI' }
      if (ghToken) headers.Authorization = `Bearer ${ghToken}`
      try {
        const upstream = await fetch(`https://api.github.com/search/${encodeURIComponent(type)}?q=${encodeURIComponent(q)}&per_page=${limit}`, { headers })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path === '/api/github/file' && req.method === 'GET') {
      const env = getEnv()
      const ghToken = (env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || '').trim()
      const params = new URL(req.url || '', 'http://localhost').searchParams
      const owner = params.get('owner') || ''
      const repo = params.get('repo') || ''
      const filePath = params.get('path') || ''
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Jarvis-AI' }
      if (ghToken) headers.Authorization = `Bearer ${ghToken}`
      try {
        const upstream = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`, { headers })
        const text = await upstream.text()
        res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
      } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: (e as Error).message } })); }
      return
    }

    if (path !== '/api/llm' || req.method !== 'POST') {
      return next()
    }

    const env = getEnv()
    const { key, base } = getOpenAiConfig(env)
    if (!key) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: {
            message:
              'Missing OPENAI_API_KEY. Add it to .env (used only by the dev/preview proxy, not shipped to the browser).',
          },
        })
      )
      return
    }

    try {
      const bodyRaw = await readBody(req)
      const body = llmChatBody.normalizeLlmChatCompletionBody(bodyRaw, env, 'openai')
      const upstream = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body,
      })
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(text)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: { message: e instanceof Error ? e.message : 'Proxy error' },
        })
      )
    }
  })
}

/**
 * Proxies POST /api/llm → OpenAI-compatible chat completions so the API key stays server-side during dev/preview.
 * Also exposes POST /api/realtime/session → OpenAI `client_secrets` for browser WebRTC Realtime sessions.
 */
export function openaiProxyPlugin(): Plugin {
  return {
    name: 'openai-proxy',
    configureServer(server) {
      attachProxy(
        () => loadEnv(server.config.mode, server.config.envDir, ''),
        server.middlewares
      )
    },
    configurePreviewServer(server) {
      attachProxy(
        () => loadEnv(server.config.mode, server.config.envDir, ''),
        server.middlewares
      )
    },
  }
}
