/**
 * URLs that must not become the main embedded iframe `src` — they are typically
 * OAuth/token endpoints or nested-frame navigations that render blank or break UX.
 *
 * Keep logic aligned with `isEmbeddableBrowserNavigationUrl` in `electron/main.cjs`.
 */

import { isSafeScheme, parseUrlSafely } from '@/lib/url-validation'

export function isEmbeddableBrowserNavigationUrl(rawUrl: string): boolean {
  // Parse URL safely; reject if parse fails
  const parsed = parseUrlSafely(rawUrl)
  if (!parsed) return false

  // Only allow http/https schemes
  if (!isSafeScheme(parsed.scheme)) return false

  // Reject OAuth and identity provider paths
  const pathLower = parsed.pathname.toLowerCase()
  if (pathLower.includes('/identity/') || pathLower.includes('idtoken')) return false
  if (pathLower.includes('/oauth')) return false
  if (pathLower.endsWith('/token') || pathLower.includes('/token?')) return false
  if (pathLower.includes('/authorize') && pathLower.includes('/token')) return false

  return true
}
