/**
 * Dev / `vite preview` middleware: keeps OpenAI credentials server-side.
 *
 * Routes:
 * - `POST /api/llm` — chat completions (existing).
 * - `POST /api/images` — OpenAI `images/generations` or `images/edits` (JSON + multipart)
 *   using `OPENAI_API_KEY`. Upstream may return **429**; do not log response bodies.
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
import { randomUUID } from 'node:crypto'
import { mergeRealtimeSessionBody } from '../src/lib/voice/realtimeSessionDefaults'

/** Appended server-side when `photoreal: true` (Phase 7). */
const IMAGE_PHOTOREAL_SUFFIX =
  ' Ultra photorealistic detail: natural skin texture with visible pores, individual hair strands, soft natural lighting, shallow depth of field, 85mm lens character, high resolution, avoid plastic or waxy skin.'

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

function parseImageSize(size: string): { w: number; h: number } {
  const m = /^(\d+)x(\d+)$/.exec(size)
  if (m) {
    return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) }
  }
  return { w: 1024, h: 1024 }
}

async function handlePostApiImages(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  getEnv: () => Record<string, string>
): Promise<void> {
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

  let rawBody: string
  try {
    rawBody = await readBody(req)
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Could not read body' } }))
    return
  }

  if (rawBody.length > 25_000_000) {
    res.statusCode = 413
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Request body too large' } }))
    return
  }

  let body: {
    mode?: string
    prompt?: string
    size?: string
    quality?: string
    n?: number
    photoreal?: boolean
    references?: Array<{ base64: string; mimeType: string }>
    referenceRightsConfirmed?: boolean
  }
  try {
    body = JSON.parse(rawBody) as typeof body
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }))
    return
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt || prompt.length > 4000) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Invalid prompt' } }))
    return
  }

  const mode = body.mode === 'edits' ? 'edits' : 'generations'
  const refs = Array.isArray(body.references) ? body.references : []
  let finalPrompt = prompt
  if (body.photoreal) {
    finalPrompt += IMAGE_PHOTOREAL_SUFFIX
  }

  try {
    if (mode === 'generations') {
      const size = body.size || '1024x1024'
      const quality = body.quality === 'hd' ? 'hd' : 'standard'
      const upstream = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: finalPrompt,
          n: 1,
          size,
          quality,
          response_format: 'b64_json',
        }),
      })
      const text = await upstream.text()
      if (!upstream.ok) {
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(text)
        return
      }
      const parsed = JSON.parse(text) as {
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
      }
      const { w, h } = parseImageSize(size)
      const images = (parsed.data || []).map((d) => ({
        id: randomUUID(),
        promptSnapshot: d.revised_prompt || finalPrompt,
        width: w,
        height: h,
        mimeType: 'image/png',
        base64: d.b64_json,
        url: d.url,
      }))
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ images }))
      return
    }

    if (refs.length === 0) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Reference image required for edit mode' } }))
      return
    }
    if (!body.referenceRightsConfirmed) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Reference rights not confirmed' } }))
      return
    }
    const first = refs[0]
    if (first.mimeType !== 'image/png') {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Reference must be PNG for edits' } }))
      return
    }
    let buf: Buffer
    try {
      buf = Buffer.from(first.base64, 'base64')
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Invalid base64' } }))
      return
    }
    if (buf.length > 3_500_000) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Reference image too large' } }))
      return
    }

    const form = new FormData()
    const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' })
    form.append('image', blob, 'reference.png')
    form.append('prompt', finalPrompt)
    form.append('model', 'dall-e-2')
    form.append('n', '1')
    form.append('size', '1024x1024')

    const upstream = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(text)
      return
    }
    const parsed = JSON.parse(text) as {
      data?: Array<{ b64_json?: string; url?: string }>
    }
    const { w, h } = parseImageSize('1024x1024')
    const images = (parsed.data || []).map((d) => ({
      id: randomUUID(),
      promptSnapshot: finalPrompt,
      width: w,
      height: h,
      mimeType: 'image/png',
      base64: d.b64_json,
      url: d.url,
    }))
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
}

function attachProxy(getEnv: () => Record<string, string>, middlewares: Connect.Server) {
  middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const path = req.url?.split('?')[0]

    if (path === '/api/images' && req.method === 'POST') {
      await handlePostApiImages(req, res, getEnv)
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
