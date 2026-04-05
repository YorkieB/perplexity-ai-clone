import { PassThrough } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { attachBrowseProxyForTests } from '../../vite-plugins/browser-proxy'
import { attachOpenAiProxyForTests } from '../../vite-plugins/openai-proxy'

type Middleware = (
  req: import('vite').Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  next: import('vite').Connect.NextFunction,
) => void | Promise<void>

class MiddlewareServerMock {
  public handler: Middleware = async () => {}

  use(handler: Middleware) {
    this.handler = handler
  }
}

class ResponseMock {
  statusCode = 200
  headersSent = false
  private readonly headers = new Map<string, string>()
  private readonly chunks: Buffer[] = []

  setHeader(name: string, value: string | number | readonly string[]) {
    const serialized = Array.isArray(value) ? value.join(', ') : String(value)
    this.headers.set(name.toLowerCase(), serialized)
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase())
  }

  write(chunk: string | Uint8Array) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return true
  }

  end(chunk?: string | Uint8Array) {
    if (chunk !== undefined) {
      this.write(chunk)
    }
    this.headersSent = true
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}

function makeRequest(options: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}) {
  const req = new PassThrough() as PassThrough & import('vite').Connect.IncomingMessage
  req.url = options.url
  req.method = options.method
  req.headers = options.headers ?? {}
  return {
    req,
    send() {
      if (options.body) {
        req.write(options.body)
      }
      req.end()
    },
  }
}

async function runMiddleware(
  handler: Middleware,
  options: { url: string; method: string; headers?: Record<string, string>; body?: string },
) {
  const { req, send } = makeRequest(options)
  const res = new ResponseMock()
  let nextCalled = false
  const work = Promise.resolve(handler(req, res as never, () => {
    nextCalled = true
  }))
  send()
  await work
  return { res, nextCalled }
}

describe('Proxy middleware security boundaries', () => {
  const SERVER_CREDENTIAL = 'cfgv1'
  const SAMPLE_CODE_VALUE = 'cv1'
  const SAMPLE_ALT_CREDENTIAL = 'badv1'
  const SAMPLE_ACCESS_VALUE = 'av1'
  const SAMPLE_ROTATE_VALUE = 'rv1'
  const SAMPLE_REFRESHED_ACCESS_VALUE = 'av2'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks SSRF targets in the browse proxy before any upstream fetch', async () => {
    const server = new MiddlewareServerMock()
    attachBrowseProxyForTests(server as never)
    const fetchMock = vi.fn()

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res, nextCalled } = await runMiddleware(server.handler, {
      method: 'GET',
      url: '/api/browse-proxy?url=http%3A%2F%2F127.0.0.1%3A8080%2Fadmin',
    })

    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.text()).toContain('Access denied')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks redirect chains that resolve to private or loopback hosts', async () => {
    const server = new MiddlewareServerMock()
    attachBrowseProxyForTests(server as never)

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1:9999/admin' },
        })
      )

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res, nextCalled } = await runMiddleware(server.handler, {
      method: 'GET',
      url: '/api/browse-proxy?url=https%3A%2F%2Fexample.com%2Flogin',
    })

    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(502)
    expect(res.text()).toContain('Blocked upstream redirect target')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sanitizes iframe-breaking headers and injects navigation controls into proxied HTML', async () => {
    const server = new MiddlewareServerMock()
    attachBrowseProxyForTests(server as never)

    const upstream = new Response('<html><head><title>Test</title></head><body>Hello</body></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
        'x-extra-header': 'kept',
      },
    })
    const fetchMock = vi.fn(async () => upstream)

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res } = await runMiddleware(server.handler, {
      method: 'GET',
      url: '/api/browse-proxy?url=https%3A%2F%2Fexample.com%2Fdocs%2Fpage.html',
    })

    const body = res.text()
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('x-frame-options')).toBeUndefined()
    expect(res.getHeader('content-security-policy')).toBe(
      'sandbox allow-forms allow-modals allow-popups allow-scripts'
    )
    expect(res.getHeader('x-extra-header')).toBe('kept')
    expect(body).toContain('<base href="https://example.com/docs/">')
    expect(body).toContain('data-jarvis-proxy')
    expect(body).toContain('var PROXY = "/api/browse-proxy";')
    expect(body).toContain("lower.startsWith('javascript:') || lower.startsWith('data:')")
    expect(body).toContain("if (rw === 'about:blank') { e.preventDefault(); return; }")
    expect(body).toContain("PROXY + '?url=' + encodeURIComponent(u.href)")
  })

  it('rejects embeddings requests when the server-side OpenAI key is missing', async () => {
    const server = new MiddlewareServerMock()
    attachOpenAiProxyForTests(() => ({}), server as never)
    const fetchMock = vi.fn()

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res } = await runMiddleware(server.handler, {
      method: 'POST',
      url: '/api/embeddings',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: ['hello'] }),
    })

    expect(res.statusCode).toBe(500)
    expect(res.text()).toContain('Missing OPENAI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds OAuth client secrets server-side during code exchange and ignores client-supplied secrets', async () => {
    const server = new MiddlewareServerMock()
    attachOpenAiProxyForTests(
      () => ({
        OAUTH_CLIENT_SECRET_GITHUB: SERVER_CREDENTIAL,
      }),
      server as never,
    )

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      expect(params.get('client_secret')).toBe(SERVER_CREDENTIAL)
      expect(params.get('client_secret')).not.toBe(SAMPLE_ALT_CREDENTIAL)
      expect(params.get('client_id')).toBe('github-client-id')
      expect(params.get('code')).toBe(SAMPLE_CODE_VALUE)
      return new Response(JSON.stringify({ access_token: SAMPLE_ACCESS_VALUE }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res } = await runMiddleware(server.handler, {
      method: 'POST',
      url: '/api/oauth/exchange',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'github',
        code: SAMPLE_CODE_VALUE,
        clientId: 'github-client-id',
        clientSecret: SAMPLE_ALT_CREDENTIAL,
        redirectUri: 'https://app.example.com/oauth/callback',
      }),
    })

    expect(res.statusCode).toBe(200)
    expect(res.text()).toContain(SAMPLE_ACCESS_VALUE)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('adds OAuth client id and secret server-side during refresh and ignores missing client data from the browser', async () => {
    const server = new MiddlewareServerMock()
    attachOpenAiProxyForTests(
      () => ({
        OAUTH_CLIENT_ID_GOOGLEDRIVE: 'server-client-id',
        OAUTH_CLIENT_SECRET_GOOGLEDRIVE: SERVER_CREDENTIAL,
      }),
      server as never,
    )

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      expect(params.get('client_id')).toBe('server-client-id')
      expect(params.get('client_secret')).toBe(SERVER_CREDENTIAL)
      expect(params.get('refresh_token')).toBe(SAMPLE_ROTATE_VALUE)
      return new Response(JSON.stringify({ access_token: SAMPLE_REFRESHED_ACCESS_VALUE }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const { res } = await runMiddleware(server.handler, {
      method: 'POST',
      url: '/api/oauth/refresh',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'googledrive',
        refreshToken: SAMPLE_ROTATE_VALUE,
      }),
    })

    expect(res.statusCode).toBe(200)
    expect(res.text()).toContain(SAMPLE_REFRESHED_ACCESS_VALUE)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})