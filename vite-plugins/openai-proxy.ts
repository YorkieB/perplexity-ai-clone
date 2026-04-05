/**
 * Dev / `vite preview` middleware: keeps OpenAI credentials server-side.
 *
 * Routes:
 * - `POST /api/llm` — chat completions (existing).
 * - `POST /api/tts` — text-to-speech via OpenAI audio/speech (voice pipeline output).
 * - `POST /api/realtime/session` — mints a short-lived Realtime client secret via
 *   `POST https://api.openai.com/v1/realtime/client_secrets` using `OPENAI_API_KEY`.
 *   The browser must **not** receive the long-lived API key; it only gets the returned
 *   `value` (ephemeral key) and uses it with WebRTC per OpenAI’s Realtime docs:
 *   WebRTC offer → `POST /v1/realtime/calls` with `Authorization: Bearer <ephemeral>`.
 *
 * No separate Node server is required: this uses Vite’s Connect middleware in dev and
 * preview. Production static hosting still needs an equivalent backend route.
 */
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { ServerResponse } from 'node:http'
import { randomInt } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tokenGenerate } from '@vonage/jwt'

const requireVonage = createRequire(import.meta.url)
const _pluginDir = dirname(fileURLToPath(import.meta.url))
const vonageShared = requireVonage(join(_pluginDir, '..', 'scripts', 'vonage-voice-shared.cjs')) as {
  normalizeVonagePhoneDigits: (raw: string) => string
  loadVonagePrivateKeyPem: (env: Record<string, string>) => string
  buildVonageAiVoiceWebSocketUri: (env: Record<string, string>) => string | null
}

/** ImapFlow envelope address shape (minimal for formatting). */
type MailAddr = { name?: string; address?: string }

function formatAddrLine(addrs: MailAddr[] | undefined): string {
  return (addrs || []).map((a) => (a.address ? `${a.name || ''} <${a.address}>`.trim() : a.name || '')).join(', ')
}

function formatAddrPlain(addrs: MailAddr[] | undefined): string {
  return (addrs || []).map((a) => a.address || a.name || '').join(', ')
}

function stripHtmlTags(input: string | undefined): string {
  let out = ''
  let inTag = false
  for (const ch of String(input || '')) {
    if (ch === '<') {
      inTag = true
      continue
    }
    if (ch === '>') {
      inTag = false
      continue
    }
    if (!inTag) out += ch
  }
  return out
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
  messageFlagsAdd: (uid: number, flags: string[]) => Promise<void>
  messageFlagsRemove: (uid: number, flags: string[]) => Promise<void>
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

function readBodyRaw(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function writeUpstreamBody(upstream: Response, res: ServerResponse): Promise<void> {
  if (upstream.body) {
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        res.end()
        return
      }
      res.write(value)
    }
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  res.end(buf)
}

function getOpenAiConfig(env: Record<string, string>): {
  key: string | undefined
  base: string
} {
  const key = env.OPENAI_API_KEY?.trim() || env.VITE_OPENAI_API_KEY?.trim()
  const base =
    env.OPENAI_BASE_URL?.replace(/\/$/, '') ||
    env.VITE_OPENAI_BASE_URL?.replace(/\/$/, '') ||
    'https://api.openai.com/v1'
  return { key, base }
}

function getOAuthEnvValue(
  env: Record<string, string>,
  provider: string,
  field: 'CLIENT_ID' | 'CLIENT_SECRET',
): string {
  const p = provider.toUpperCase()
  const candidates = [
    `OAUTH_CLIENT_${field === 'CLIENT_ID' ? 'ID' : 'SECRET'}_${p}`,
    `OAUTH_${p}_${field}`,
  ]
  for (const key of candidates) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return ''
}

const viteBookCache = new Map<string, { title: string; authors: string[]; fullText: string; fetchedAt: number }>()

function stripGutenbergBoilerplate(text: string): string {
  let content = text
  const startPattern = /\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i
  const startMatch = startPattern.exec(content)
  if (startMatch?.index != null) {
    content = content.slice(startMatch.index + startMatch[0].length)
  }
  const endPattern = /\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK/i
  const endMatch = endPattern.exec(content)
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
  // Note: High complexity due to 37+ route handlers; architectural decomposition deferred to future refactor.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const path = req.url?.split('?')[0]

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
          body: rawBody as unknown as BodyInit,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Wake word proxy error' } }))
      }
      return
    }

    // ── Text-to-Speech (OpenAI audio/speech) ──
    if (path === '/api/tts' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY for TTS.' } }))
        return
      }
      try {
        const body = await readBody(req)
        const upstream = await fetch(`${base}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body,
        })
        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => upstream.statusText)
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: `TTS upstream error: ${upstream.status} ${errText}` } }))
          return
        }
        res.statusCode = 200
        const ct = upstream.headers.get('content-type')
        if (ct) res.setHeader('Content-Type', ct)
        const cl = upstream.headers.get('content-length')
        if (cl) res.setHeader('Content-Length', cl)
        await writeUpstreamBody(upstream, res)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'TTS proxy error' } }))
      }
      return
    }

    // ── Embeddings (CRIT-08 security proxy) ──
    // SECURITY: Routes embedding requests server-side so the OpenAI API key is never exposed to the browser.
    // Can be used by SemanticRouter and other client-side components.
    if (path === '/api/embeddings' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY for embeddings.' } }))
        return
      }
      try {
        const body = await readBody(req)
        const parsed = JSON.parse(body) as { model?: string; input?: string | string[] }
        const upstream = await fetch(`${base}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: parsed.model || 'text-embedding-3-small',
            input: parsed.input,
          }),
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Embeddings proxy error' } }))
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
          body: rawBody as unknown as BodyInit,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
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
        await writeUpstreamBody(upstream, res)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video content proxy error' } }))
      }
      return
    }

    // ── DigitalOcean: tell the client whether `DIGITALOCEAN_API_KEY` is set server-side (.env)
    // so the UI loads the DO catalog without requiring `VITE_USE_DO_INFERENCE` at build time.
    if (path === '/api/digitalocean/config' && req.method === 'GET') {
      const env = getEnv()
      const has = Boolean((env.DIGITALOCEAN_API_KEY || env.VITE_DIGITALOCEAN_API_KEY || '').trim())
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ inferenceKeyFromEnv: has }))
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
    const llmProviderHeader = typeof req.headers['x-llm-provider'] === 'string' ? req.headers['x-llm-provider'] : ''
    if (path === '/api/llm' && req.method === 'POST' && llmProviderHeader.toLowerCase() === 'digitalocean') {
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
        const body = await readBody(req)
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
        const query = (req.url || '').split('?')[1] || ''
        const upstream = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${query}`, { headers: { 'xi-api-key': elKey } })
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
      // SECURITY (CRIT-17): Removed VITE_ELEVENLABS_API_KEY (client-bundled).
      const elKey = (env.ELEVENLABS_API_KEY || '').trim()
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
          res.end(JSON.stringify({ error: { message: errText } }))
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

    // ── ElevenLabs Text-to-Speech (CRIT-17 security proxy) ──
    if (path === '/api/tts/elevenlabs' && req.method === 'POST') {
      const env = getEnv()
      const elKey = (env.ELEVENLABS_API_KEY || '').trim()
      if (!elKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY (server-side only, no VITE_ prefix)' } }))
        return
      }
      try {
        const rawBody = await readBody(req)
        const body = JSON.parse(rawBody)
        const voiceId = body.voiceId || 'pNInz6obpgDQGcFmaJgB'
        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000&optimize_streaming_latency=3`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elKey,
            },
            body: JSON.stringify({
              text: body.text,
              model_id: body.modelId || 'eleven_turbo_v2_5',
              voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
            }),
          },
        )
        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => upstream.statusText)
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: errText } }))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'audio/pcm')
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.end(buf)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs TTS proxy error' } }))
      }
      return
    }

    // ── OAuth Token Exchange (CRIT-04 security proxy) ──
    if (path === '/api/oauth/exchange' && req.method === 'POST') {
      const env = getEnv()
      try {
        const rawBody = await readBody(req)
        const body = JSON.parse(rawBody)
        const { provider, code, clientId, redirectUri } = body
        
        if (!provider || !code || !clientId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Missing provider, code, or clientId' }))
          return
        }

        // Read server-side OAuth secrets (no VITE_ prefix — not sent to client)
        const providerKey = provider.toUpperCase()
        const clientSecret = getOAuthEnvValue(env, provider, 'CLIENT_SECRET')

        if (!clientSecret) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: `OAuth client secret not configured. Expected one of OAUTH_CLIENT_SECRET_${providerKey} or OAUTH_${providerKey}_CLIENT_SECRET`,
            }),
          )
          return
        }

        // Look up token URL for this provider
        const tokenUrls: Record<string, string> = {
          dropbox: 'https://api.dropboxapi.com/oauth2/token',
          googledrive: 'https://oauth2.googleapis.com/token',
          onedrive: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          github: 'https://github.com/login/oauth/access_token',
        }
        const tokenUrl = tokenUrls[provider.toLowerCase()]
        if (!tokenUrl) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Unknown OAuth provider: ${provider}` }))
          return
        }

        // Exchange code for token (client secret added server-side)
        const tokenBody = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        })

        const upstream = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: tokenBody.toString(),
        })

        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'OAuth exchange proxy error' } }))
      }
      return
    }

    // ── OAuth Token Refresh (Secure Server-Side) ──
    // SECURITY: Token refresh always uses server-side client secrets.
    // Browser sends only refresh token; server adds clientSecret from .env.
    if (path === '/api/oauth/refresh' && req.method === 'POST') {
      const env = getEnv()
      try {
        const rawBody = await readBody(req)
        const body = JSON.parse(rawBody)
        const { provider, refreshToken } = body

        if (!provider || !refreshToken) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Missing provider or refreshToken' }))
          return
        }

        // Read server-side OAuth secrets (no VITE_ prefix — not sent to client)
        const providerKey = provider.toUpperCase()
        const clientSecret = getOAuthEnvValue(env, provider, 'CLIENT_SECRET')
        const clientId = getOAuthEnvValue(env, provider, 'CLIENT_ID')

        if (!clientSecret || !clientId) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: `OAuth client config missing. Expected one of OAUTH_CLIENT_ID_${providerKey}/OAUTH_${providerKey}_CLIENT_ID and OAUTH_CLIENT_SECRET_${providerKey}/OAUTH_${providerKey}_CLIENT_SECRET`,
            }),
          )
          return
        }

        // Look up token URL for this provider
        const tokenUrls: Record<string, string> = {
          dropbox: 'https://api.dropboxapi.com/oauth2/token',
          googledrive: 'https://oauth2.googleapis.com/token',
          onedrive: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          github: 'https://github.com/login/oauth/access_token',
        }
        const tokenUrl = tokenUrls[provider.toLowerCase()]
        if (!tokenUrl) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Unknown OAuth provider: ${provider}` }))
          return
        }

        // Refresh token (client secret added server-side)
        const tokenBody = new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        })

        const upstream = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: tokenBody.toString(),
        })

        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'OAuth refresh proxy error' } }))
      }
      return
    }

    // ── Tavily Search (API key security proxy) ──
    if (path === '/api/search/tavily' && req.method === 'POST') {
      const env = getEnv()
      const apiKey = (env.TAVILY_API_KEY || '').trim()
      if (!apiKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing TAVILY_API_KEY (server-side only, no VITE_ prefix)' } }))
        return
      }
      try {
        const rawBody = await readBody(req)
        const body = JSON.parse(rawBody)
        
        const upstream = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,  // Added server-side
            query: body.query,
            search_depth: body.searchDepth || 'basic',
            include_answer: body.includeAnswer ?? false,
            max_results: body.maxResults || 6,
          }),
        })

        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
      } catch (e) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Tavily search proxy error' } }))
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
          body: rawBody as unknown as BodyInit,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Voice analysis service unavailable', vocalState: 'Unable to analyse voice' }))
      }
      return
    }

    // ── X (Twitter) API proxy ──
    if (path === '/api/x/tweet' && req.method === 'POST') {
      const env = getEnv()
      const bearerToken = (env.X_BEARER_TOKEN || env.X_ACCESS_TOKEN || '').trim()
      if (!bearerToken) {
        res.statusCode = 401; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Missing X bearer credential' } })); return
      }
      try {
        const body = JSON.parse(await readBody(req))
        const url = 'https://api.twitter.com/2/tweets'
        const upstream = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
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
      const emailAction = path.replaceAll('/api/email/', '')
      const body = JSON.parse(await readBody(req) || '{}')

      const acctId = (body.account || env.EMAIL_1_ADDRESS || '').trim()
      let emailAddr = ''
      let emailPass = ''
      const imapHost = (env.EMAIL_IMAP_HOST || 'mail.livemail.co.uk').trim()
      const imapPort = Number.parseInt(env.EMAIL_IMAP_PORT || '993', 10)
      const smtpHost = (env.EMAIL_SMTP_HOST || 'smtp.livemail.co.uk').trim()
      const smtpPort = Number.parseInt(env.EMAIL_SMTP_PORT || '465', 10)

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
        const { ImapFlow } = (await import('imapflow')) as unknown as ImapFlowModule

        if (emailAction === 'inbox' || emailAction === 'search') {
          const client = new ImapFlow({ host: imapHost, port: imapPort, secure: true, auth: { user: emailAddr, pass: emailPass }, logger: false })
          await client.connect()
          const folder = body.folder || 'INBOX'
          const lock = await client.getMailboxLock(folder)
          try {
            const limit = body.limit || 20
            let msgUids: number[]
            if (emailAction === 'search' && body.query) {
              msgUids = await client.search({ or: [{ subject: body.query }, { from: body.query }, { body: body.query }] })
              msgUids = msgUids.slice(-limit).reverse()
            } else {
              const total = client.mailbox?.exists || 0
              const from = Math.max(1, total - limit + 1)
              msgUids = await client.search({ seq: `${from}:*` })
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
                seen: (msg.flags || new Set()).has(String.raw`\Seen`),
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
                body: parsed.text || stripHtmlTags(parsed.html) || '(empty)',
                replyTo: formatAddrPlain(env2.replyTo),
                seen: (msg.flags || new Set()).has(String.raw`\Seen`),
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
            if (body.read) { await client.messageFlagsAdd(body.uid, [String.raw`\Seen`]) }
            else { await client.messageFlagsRemove(body.uid, [String.raw`\Seen`]) }
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
        let digits = rawTo.replaceAll(/\s+/g, '')
        if (digits.startsWith('00')) digits = digits.slice(2)
        if (digits.startsWith('+')) digits = digits.slice(1)
        digits = digits.replaceAll(/\D/g, '')
        if (digits.length === 11 && digits.startsWith('0')) {
          digits = `44${digits.slice(1)}`
        }
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
        if (msg?.status !== '0') {
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
        const fromDigits = fromRaw.replaceAll(/\D/g, '')
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
      const limit = Number.parseInt(params.get('limit') || '10', 10)
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
          const rowIdx = id.replaceAll('hf-tinystories-', '')
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
        if (!parsed.callBackUrl) parsed.callBackUrl = 'https://localhost/suno-callback'
        const upstream = await fetch('https://api.sunoapi.org/api/v1/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sunoKey}` },
          body: JSON.stringify(parsed),
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
      const body = await readBody(req)
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

export function attachOpenAiProxyForTests(
  getEnv: () => Record<string, string>,
  middlewares: Connect.Server,
) {
  attachProxy(getEnv, middlewares)
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
