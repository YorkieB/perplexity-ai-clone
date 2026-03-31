import { defaultHomepageFromEnv } from '@/browser/constants'
import type { BrowserSettings } from '@/browser/types'
/** Heuristic: treat as URL if it looks like a host or scheme (keep pattern simple for sonar). */
const URL_LIKE = /^(https?:\/\/|about:|file:|data:|[\w.-]+\.[a-z]{2,}\b)/i

export function looksLikeUrl(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  if (/^https?:\/\//i.test(t) || /^about:/i.test(t)) return true
  if (/\s/.test(t)) return false
  if (t.includes('/') && !t.startsWith(' ')) return true
  if (/^localhost\b/i.test(t)) return true
  return URL_LIKE.test(t)
}

export function normalizeNavigationUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return 'about:blank'
  if (/^about:/i.test(t)) return t
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

export function buildSearchUrl(template: string, query: string): string {
  const enc = encodeURIComponent(query.trim())
  return template.replace(/\{query\}/g, enc)
}

export function resolveOmniboxInput(raw: string, settings: BrowserSettings): string {
  const t = raw.trim()
  if (!t) return 'about:blank'
  if (looksLikeUrl(t)) return normalizeNavigationUrl(t)
  return buildSearchUrl(settings.defaultSearchEngine.queryUrlTemplate, t)
}

/**
 * Homepage / new-tab URL for the public web (never the Electron app origin — that used to load the shell inside the guest webview).
 */
export function resolvedLiveWebHomepage(settings: BrowserSettings): string {
  const raw = settings.homepageUrl?.trim() || defaultHomepageFromEnv()
  const u = normalizeNavigationUrl(raw)
  if (!u || u === 'about:blank') return defaultHomepageFromEnv()
  return u
}
