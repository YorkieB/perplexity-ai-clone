/**
 * Vite dev middleware: proxies web pages for the in-app browser iframe path.
 *
 * `GET /api/browse-proxy?url=<encoded-url>`
 *   Fetches the target URL server-side, strips X-Frame-Options / CSP frame-ancestors,
 *   injects `<base href>` + a navigation-intercept script, and returns the content
 *   so it renders inside an `<iframe>` without embedding restrictions.
 *
 * Only active during `npm run dev` (Vite dev/preview). The Electron desktop build
 * uses `<webview>` which loads pages natively and does not need this proxy.
 */
import type { Connect, Plugin } from 'vite'
import type { ServerResponse } from 'node:http'
import { isIP } from 'node:net'

const PROXY_PATH = '/api/browse-proxy'
const TIMEOUT_MS = 15_000
const MAX_REDIRECT_HOPS = 5

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const EMBEDDING_HEADERS_TO_STRIP = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
])

const IPV4_BLOCKLIST = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^255\./,
]

const IPV6_BLOCKLIST = [
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^ff/i,
]

function writeJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  const safeMessage = String(message).replaceAll('<', '').replaceAll('>', '')
  res.end(JSON.stringify({ error: safeMessage }))
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function isBlockedIpAddress(hostname: string): { blocked: boolean; reason?: string } {
  const ipType = isIP(hostname)
  if (ipType === 0) return { blocked: false }
  const ip = hostname.toLowerCase()
  if (ipType === 4 && IPV4_BLOCKLIST.some((range) => range.test(ip))) {
    return { blocked: true, reason: `Private/reserved IPv4 range: ${ip}` }
  }
  if (ipType === 6 && IPV6_BLOCKLIST.some((range) => range.test(ip))) {
    return { blocked: true, reason: `Private/reserved IPv6 range: ${ip}` }
  }
  return { blocked: false }
}

/**
 * SECURITY: Validate that a URL is safe to fetch from the proxy.
 * Blocks private/reserved IP ranges, loopback, link-local, and non-standard schemes
 * to prevent SSRF attacks against internal services.
 */
export function isSafeBrowseProxyUrl(targetUrl: string): { safe: boolean; reason?: string } {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return { safe: false, reason: 'Invalid URL' }
  }

  // Only allow http and https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Scheme ${parsed.protocol} not allowed` }
  }

  // Disallow embedded credentials in proxied targets
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URL credentials are not allowed' }
  }

  const hostname = parsed.hostname || ''

  // Reject 'localhost' and loopback names
  if (isLoopbackHostname(hostname)) {
    return { safe: false, reason: 'Loopback hosts not allowed' }
  }

  const ipCheck = isBlockedIpAddress(hostname)
  if (ipCheck.blocked) {
    return { safe: false, reason: ipCheck.reason || 'Blocked IP address' }
  }

  if (isIP(hostname) === 0) {
    // Reject single-label hostnames (might be LAN hosts)
    if (!hostname.includes('.')) {
      return { safe: false, reason: 'Single-label hostnames not allowed' }
    }
  }

  return { safe: true }
}

async function fetchWithValidatedRedirects(
  initialUrl: string,
  init: RequestInit,
  maxHops = MAX_REDIRECT_HOPS
): Promise<Response> {
  let currentUrl = initialUrl

  for (let hop = 0; hop <= maxHops; hop++) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })
    const status = response.status
    const isRedirect = status >= 300 && status < 400
    if (!isRedirect) return response

    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Upstream redirect missing Location header')
    }

    const nextUrl = new URL(location, currentUrl).href
    const validation = isSafeBrowseProxyUrl(nextUrl)
    if (!validation.safe) {
      throw new Error(`Blocked upstream redirect target: ${validation.reason || 'unsafe URL'}`)
    }

    currentUrl = nextUrl
  }

  throw new Error(`Too many redirects (>${maxHops})`)
}

function baseOrigin(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    return u.origin
  } catch {
    return ''
  }
}

function baseHref(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const parts = u.pathname.split('/')
    parts.pop()
    return `${u.origin}${parts.join('/')}/`
  } catch {
    return rawUrl
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Inline script injected into proxied HTML pages.
 * Intercepts link clicks and form submissions so navigation stays inside the proxy iframe.
 */
function navigationInterceptScript(proxyBase: string): string {
  return `
<script data-jarvis-proxy>
(function(){
  var PROXY = ${JSON.stringify(proxyBase)};
  function rewrite(href) {
    if (!href) return href;
    var lower = href.trim().toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) return 'about:blank';
    if (href.startsWith('#') || lower.startsWith('blob:')) return href;
    try { var u = new URL(href, document.baseURI); if (u.protocol === 'http:' || u.protocol === 'https:') return PROXY + '?url=' + encodeURIComponent(u.href); } catch(e){}
    return href;
  }
  document.addEventListener('click', function(e) {
    var a = e.target; while(a && a.tagName !== 'A') a = a.parentElement;
    if (!a || !a.href) return;
    if (a.target === '_blank') a.removeAttribute('target');
    var rw = rewrite(a.href);
    if (rw === 'about:blank') { e.preventDefault(); return; }
    if (rw !== a.href) { e.preventDefault(); window.location.href = rw; }
  }, true);
  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (f && f.action) {
      var rw = rewrite(f.action);
      if (rw === 'about:blank') { e.preventDefault(); return; }
      if (rw !== f.action) f.action = rw;
    }
  }, true);

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    try {
      var abs = new URL(url, document.baseURI);
      if ((abs.protocol === 'http:' || abs.protocol === 'https:') && abs.origin !== window.location.origin) {
        arguments[1] = PROXY + '?url=' + encodeURIComponent(abs.href);
      }
    } catch(ex){}
    return origOpen.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      try {
        var abs = new URL(input, document.baseURI);
        if ((abs.protocol === 'http:' || abs.protocol === 'https:') && abs.origin !== window.location.origin) {
          input = PROXY + '?url=' + encodeURIComponent(abs.href);
        }
      } catch(ex){}
    }
    return origFetch.call(this, input, init);
  };
})();
</script>`;
}

function isHtmlContentType(ct: string | null): boolean {
  if (!ct) return false
  return ct.includes('text/html') || ct.includes('application/xhtml')
}

function injectIntoHtml(html: string, targetUrl: string, proxyBase: string): string {
  const base = `<base href="${escapeHtmlAttribute(baseHref(targetUrl))}">`
  const script = navigationInterceptScript(proxyBase)

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}${script}`)
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${base}${script}</head>`)
  }
  return `${base}${script}${html}`
}

function sanitizeProxyHtml(html: string): string {
  // Remove active script blocks and inline handlers from untrusted upstream HTML.
  return html
    .replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replaceAll(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replaceAll(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replaceAll(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replaceAll(/javascript:/gi, '')
}

function isBlockedProxyContentType(ct: string | null): boolean {
  if (!ct) return false
  const lower = ct.toLowerCase()
  // Prevent direct navigation to active script payloads under app origin.
  return lower.includes('javascript') || lower.includes('ecmascript')
}

function copyUpstreamHeaders(res: ServerResponse, headers: Headers): void {
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    if (EMBEDDING_HEADERS_TO_STRIP.has(lower)) continue
    if (lower === 'set-cookie') continue
    if (lower === 'content-encoding') continue
    if (lower === 'content-length') continue
    if (lower === 'transfer-encoding') continue
    res.setHeader(key, value)
  }
}

function getTargetUrl(req: Connect.IncomingMessage): string | null {
  const urlObj = new URL(req.url || '', 'http://localhost')
  if (urlObj.pathname !== PROXY_PATH) return null
  return urlObj.searchParams.get('url')
}

async function handleBrowseProxyRequest(req: Connect.IncomingMessage, res: ServerResponse): Promise<boolean> {
  const targetUrl = getTargetUrl(req)
  if (targetUrl === null) return false

  if (!targetUrl) {
    writeJsonError(res, 400, 'Missing url parameter')
    return true
  }

  try {
    new URL(targetUrl)
  } catch {
    writeJsonError(res, 400, 'Invalid url parameter')
    return true
  }

  const urlValidation = isSafeBrowseProxyUrl(targetUrl)
  if (!urlValidation.safe) {
    console.warn(`[browse-proxy] Blocked unsafe URL: ${targetUrl} — ${urlValidation.reason}`)
    writeJsonError(res, 403, `Access denied: ${urlValidation.reason}`)
    return true
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetchWithValidatedRedirects(targetUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: baseOrigin(targetUrl),
      },
      signal: ctrl.signal,
    })
    clearTimeout(timer)

    res.statusCode = upstream.status
    copyUpstreamHeaders(res, upstream.headers)

    // Keep proxied documents isolated even though they are served from app origin.
    res.setHeader('Content-Security-Policy', 'sandbox allow-forms allow-modals allow-popups allow-scripts')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')

    const ct = upstream.headers.get('content-type')
    if (isBlockedProxyContentType(ct)) {
      writeJsonError(res, 415, 'Blocked active script content type')
      return true
    }
    if (isHtmlContentType(ct)) {
      const html = await upstream.text()
      const sanitized = sanitizeProxyHtml(html)
      const modified = injectIntoHtml(sanitized, upstream.url || targetUrl, PROXY_PATH)
      const buf = Buffer.from(modified, 'utf-8')
      res.setHeader('Content-Length', buf.length)
      res.end(buf)
      return true
    }

    writeJsonError(res, 415, 'Only HTML/XHTML browse-proxy responses are supported')
    return true
  } catch (error) {
    clearTimeout(timer)
    if (!res.headersSent) {
      if (error instanceof Error && error.message.startsWith('Blocked upstream redirect target')) {
        writeJsonError(res, 502, 'Blocked upstream redirect target')
      } else {
        writeJsonError(res, 502, 'Proxy fetch error')
      }
    }
    console.warn('[browse-proxy] Upstream fetch failed')
    return true
  }
}

function attachBrowseProxy(middlewares: Connect.Server) {
  middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const handled = await handleBrowseProxyRequest(req, res)
    if (!handled) next()
  })
}

export function attachBrowseProxyForTests(middlewares: Connect.Server) {
  attachBrowseProxy(middlewares)
}

export function browserProxyPlugin(): Plugin {
  return {
    name: 'jarvis-browser-proxy',
    configureServer(server) {
      attachBrowseProxy(server.middlewares)
    },
    configurePreviewServer(server) {
      attachBrowseProxy(server.middlewares)
    },
  }
}
