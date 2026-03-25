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
 */
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { ServerResponse } from 'node:http'

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
      const { timeoutMs: _, ...fetchOpts } = opts as Record<string, unknown>
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
      const base = plaidEnv === 'production' ? 'https://production.plaid.com' : plaidEnv === 'development' ? 'https://development.plaid.com' : 'https://sandbox.plaid.com'
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
        const base = plaidEnv === 'production' ? 'https://production.plaid.com' : plaidEnv === 'development' ? 'https://development.plaid.com' : 'https://sandbox.plaid.com'
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
        const base = plaidEnv === 'production' ? 'https://production.plaid.com' : plaidEnv === 'development' ? 'https://development.plaid.com' : 'https://sandbox.plaid.com'
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
              const offset = Math.floor(Math.random() * 2000000)
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
        const topic = genre || ['adventure', 'fairy tale', 'mystery', 'fantasy', 'fable', 'science fiction', 'romance', 'horror'][Math.floor(Math.random() * 8)]

        try {
          const gutRes = await fetchRetry(`https://gutendex.com/books?topic=${encodeURIComponent(topic)}&page=${Math.floor(Math.random() * 3) + 1}`, { timeoutMs: 10000 })
          if (gutRes.ok) {
            const gutData = await gutRes.json() as { results: Array<{ id: number; title: string; authors: Array<{ name: string }>; formats: Record<string, string> }> }
            const books = gutData.results || []
            if (books.length > 0) {
              const book = books[Math.floor(Math.random() * books.length)]
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

        const offset = Math.floor(Math.random() * 2000000)
        const hfRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${offset}&length=1`)
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
