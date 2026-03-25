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
