/**
 * Maps browser URLs to the dev-server browse proxy (`/api/browse-proxy?url=…`)
 * so external pages render inside `<iframe>` without X-Frame-Options blocking.
 *
 * Only used in the non-Electron (web dev) path. Electron `<webview>` loads pages natively.
 */

const PROXY_PATH = '/api/browse-proxy'

const SAFE_DATA_URL_PREFIXES = ['data:image/', 'data:audio/', 'data:video/'] as const

function isSafeMediaDataUrl(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase()
  return SAFE_DATA_URL_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/**
 * SECURITY: Map a URL for iframe loading while blocking dangerous schemes.
 * javascript: and executable data: URLs can execute arbitrary code in the iframe context.
 */
export function proxyUrlForIframe(rawUrl: string): string {
  if (!rawUrl) return 'about:blank'

  const trimmed = rawUrl.trim()
  if (!trimmed) return 'about:blank'

  if (trimmed.startsWith(PROXY_PATH)) return trimmed

  if (trimmed === 'about:blank') return 'about:blank'
  if (trimmed.startsWith('blob:')) return trimmed

  if (trimmed.toLowerCase().startsWith('data:')) {
    if (isSafeMediaDataUrl(trimmed)) return trimmed
    console.warn('[iframe-proxy] Blocked executable data: URL')
    return 'about:blank'
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed, globalThis.location.origin)
  } catch {
    return 'about:blank'
  }

  const protocol = parsed.protocol.toLowerCase()

  if (protocol !== 'http:' && protocol !== 'https:') {
    console.warn('[iframe-proxy] Blocked unsupported URL scheme')
    return 'about:blank'
  }

  return `${PROXY_PATH}?url=${encodeURIComponent(parsed.href)}`
}

export function isProxiedUrl(url: string): boolean {
  return url.startsWith(PROXY_PATH)
}

export function extractOriginalUrl(proxied: string): string {
  if (!proxied.startsWith(PROXY_PATH)) return proxied
  try {
    const u = new URL(proxied, 'http://localhost')
    return u.searchParams.get('url') || proxied
  } catch {
    return proxied
  }
}
