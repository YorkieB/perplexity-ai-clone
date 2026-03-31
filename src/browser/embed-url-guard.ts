/**
 * URLs that must not become the main embedded iframe `src` — they are typically
 * OAuth/token endpoints or nested-frame navigations that render blank or break UX.
 *
 * Keep logic aligned with `isEmbeddableBrowserNavigationUrl` in `electron/main.cjs`.
 */
export function isEmbeddableBrowserNavigationUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const p = u.pathname.toLowerCase()
    if (p.includes('/identity/') || p.includes('idtoken')) return false
    if (p.includes('/oauth') && (p.includes('/token') || p.endsWith('/token'))) return false
    return true
  } catch {
    return false
  }
}
