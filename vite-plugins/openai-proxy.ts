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
 * - `POST /api/images` — `POST {base}/images/generations` (OpenAI Images API, `dall-e-2` MVP).
 *   Validates prompt/size/`n`; returns `{ images: GeneratedImage[] }` JSON (no API key to client).
 *
 * No separate Node server is required: this uses Vite’s Connect middleware in dev and
 * preview. Production static hosting still needs an equivalent backend route for each path.
 */
import { randomUUID } from 'node:crypto'
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { ServerResponse } from 'node:http'
import { mergeRealtimeSessionBody } from '../src/lib/voice/realtimeSessionDefaults'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
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

/** OpenAI `dall-e-2` size presets (width × height strings). */
const IMAGE_ALLOWED_SIZES = new Set(['256x256', '512x512', '1024x1024'])
const MAX_IMAGE_PROMPT_LENGTH = 4000
const MAX_IMAGE_BODY_CHARS = 65536
const IMAGE_N_MIN = 1
const IMAGE_N_MAX = 2
const DEFAULT_IMAGE_MODEL = 'dall-e-2'

function jsonError(res: ServerResponse, status: number, message: string, code?: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: { message, ...(code ? { code } : {}) } }))
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
        /* Upstream may return 429 (rate limits / quota). Client maps this in OpenAIRealtimeVoiceSession; do not log request bodies. */
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

    if (path === '/api/images' && req.method === 'POST') {
      const env = getEnv()
      const { key, base } = getOpenAiConfig(env)
      if (!key) {
        jsonError(
          res,
          500,
          'Missing OPENAI_API_KEY. Add it to .env (used only by the dev/preview proxy, not shipped to the browser).'
        )
        return
      }

      try {
        const rawBody = await readBody(req)
        if (rawBody.length > MAX_IMAGE_BODY_CHARS) {
          jsonError(res, 413, 'Request body too large', 'PAYLOAD_TOO_LARGE')
          return
        }

        let body: unknown
        try {
          body = rawBody.trim() ? (JSON.parse(rawBody) as unknown) : null
        } catch {
          jsonError(res, 400, 'Invalid JSON body', 'BAD_REQUEST')
          return
        }

        if (!body || typeof body !== 'object') {
          jsonError(res, 400, 'Expected JSON object', 'BAD_REQUEST')
          return
        }

        const o = body as Record<string, unknown>
        const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
        if (!prompt.length) {
          jsonError(res, 400, 'Missing or empty "prompt"', 'BAD_REQUEST')
          return
        }
        if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
          jsonError(res, 400, `Prompt exceeds ${MAX_IMAGE_PROMPT_LENGTH} characters`, 'BAD_REQUEST')
          return
        }

        const w = o.width
        const h = o.height
        if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h)) {
          jsonError(res, 400, '"width" and "height" must be finite numbers', 'BAD_REQUEST')
          return
        }
        if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
          jsonError(res, 400, '"width" and "height" must be positive integers', 'BAD_REQUEST')
          return
        }

        const sizeStr = `${w}x${h}`
        if (!IMAGE_ALLOWED_SIZES.has(sizeStr)) {
          jsonError(
            res,
            400,
            `Unsupported size ${sizeStr}. Allowed: ${[...IMAGE_ALLOWED_SIZES].join(', ')}`,
            'BAD_REQUEST'
          )
          return
        }

        let n = typeof o.n === 'number' ? Math.floor(o.n) : 1
        if (!Number.isFinite(n) || n < IMAGE_N_MIN) {
          n = IMAGE_N_MIN
        }
        n = Math.min(n, IMAGE_N_MAX)

        const model = typeof o.model === 'string' && o.model.trim() ? o.model.trim() : DEFAULT_IMAGE_MODEL

        const upstream = await fetch(`${base}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            prompt,
            n,
            size: sizeStr,
            response_format: 'url',
          }),
        })

        const text = await upstream.text()
        if (!upstream.ok) {
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
          return
        }

        let parsed: { data?: Array<{ url?: string; b64_json?: string }> }
        try {
          parsed = JSON.parse(text) as { data?: Array<{ url?: string; b64_json?: string }> }
        } catch {
          jsonError(res, 502, 'Invalid JSON from image upstream', 'UPSTREAM')
          return
        }

        const rows = parsed.data
        if (!Array.isArray(rows)) {
          jsonError(res, 502, 'Missing data array from image upstream', 'UPSTREAM')
          return
        }

        const images = rows.map((item) => {
          const id = randomUUID()
          const baseImage = {
            id,
            promptSnapshot: prompt,
            width: w,
            height: h,
            mimeType: 'image/png',
          }
          if (typeof item.url === 'string' && item.url.length > 0) {
            return { ...baseImage, url: item.url }
          }
          if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
            return { ...baseImage, base64: item.b64_json }
          }
          return { ...baseImage }
        })

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ images }))
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
 * Also exposes POST /api/realtime/session → OpenAI `client_secrets` for browser WebRTC Realtime sessions,
 * and POST /api/images → OpenAI `images/generations` (text-only, `dall-e-2` size allowlist).
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
