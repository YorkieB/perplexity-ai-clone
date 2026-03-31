/**
 * Maps browser URLs to the dev-server browse proxy (`/api/browse-proxy?url=…`)
 * so external pages render inside `<iframe>` without X-Frame-Options blocking.
 *
 * Only used in the non-Electron (web dev) path. Electron `<webview>` loads pages natively.
 */

const PROXY_PATH = '/api/browse-proxy'

export function proxyUrlForIframe(rawUrl: string): string {
  if (!rawUrl || rawUrl === 'about:blank') return 'about:blank'
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('javascript:')) return rawUrl
  if (rawUrl.startsWith(PROXY_PATH)) return rawUrl
  return `${PROXY_PATH}?url=${encodeURIComponent(rawUrl)}`
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
