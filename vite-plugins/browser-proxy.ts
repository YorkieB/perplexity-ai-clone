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

const PROXY_PATH = '/api/browse-proxy'
const TIMEOUT_MS = 15_000

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const EMBEDDING_HEADERS_TO_STRIP = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
])

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
    if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('data:') || href.startsWith('blob:')) return href;
    try { var u = new URL(href, document.baseURI); if (u.protocol === 'http:' || u.protocol === 'https:') return PROXY + '?url=' + encodeURIComponent(u.href); } catch(e){}
    return href;
  }
  document.addEventListener('click', function(e) {
    var a = e.target; while(a && a.tagName !== 'A') a = a.parentElement;
    if (!a || !a.href) return;
    if (a.target === '_blank') a.removeAttribute('target');
    var rw = rewrite(a.href);
    if (rw !== a.href) { e.preventDefault(); window.location.href = rw; }
  }, true);
  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (f && f.action) { var rw = rewrite(f.action); if (rw !== f.action) f.action = rw; }
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
  const base = `<base href="${baseHref(targetUrl)}">`
  const script = navigationInterceptScript(proxyBase)

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}${script}`)
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${base}${script}</head>`)
  }
  return `${base}${script}${html}`
}

function attachBrowseProxy(middlewares: Connect.Server) {
  middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const urlObj = new URL(req.url || '', 'http://localhost')
    if (urlObj.pathname !== PROXY_PATH) return next()

    const targetUrl = urlObj.searchParams.get('url')
    if (!targetUrl) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing url parameter' }))
      return
    }

    try {
      new URL(targetUrl)
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid url parameter' }))
      return
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: baseOrigin(targetUrl),
        },
        redirect: 'follow',
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      res.statusCode = upstream.status

      for (const [key, value] of upstream.headers.entries()) {
        if (EMBEDDING_HEADERS_TO_STRIP.has(key.toLowerCase())) continue
        if (key.toLowerCase() === 'set-cookie') continue
        if (key.toLowerCase() === 'content-encoding') continue
        if (key.toLowerCase() === 'content-length') continue
        if (key.toLowerCase() === 'transfer-encoding') continue
        res.setHeader(key, value)
      }

      const ct = upstream.headers.get('content-type')
      if (isHtmlContentType(ct)) {
        const html = await upstream.text()
        const proxyBase = PROXY_PATH
        const modified = injectIntoHtml(html, upstream.url || targetUrl, proxyBase)
        const buf = Buffer.from(modified, 'utf-8')
        res.setHeader('Content-Length', buf.length)
        res.end(buf)
      } else {
        if (upstream.body) {
          const reader = (upstream.body as ReadableStream<Uint8Array>).getReader()
          const pump = async () => {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) {
                res.end()
                return
              }
              res.write(value)
            }
          }
          await pump()
        } else {
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.end(buf)
        }
      }
    } catch (e) {
      clearTimeout(timer)
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: e instanceof Error ? e.message : 'Proxy fetch error',
          })
        )
      }
    }
  })
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
