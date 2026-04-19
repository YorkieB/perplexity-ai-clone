import type { FocusMode } from './types'

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'ac.uk',
  'co.jp',
  'co.nz',
  'co.uk',
  'com.au',
  'com.br',
  'com.mx',
  'com.sg',
  'gov.uk',
  'net.au',
  'org.au',
  'org.uk',
])

function looksLikeIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
}

function extractHostname(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).hostname
  } catch {
    // Fall back for values that are already hostnames (no protocol).
    return trimmed.split('/')[0]?.trim() || null
  }
}

/**
 * Normalize source URLs for deduplication.
 *
 * Policy:
 * - Strip fragment/hash.
 * - Remove trailing slash from non-root paths.
 * - Preserve query string to avoid collapsing semantically distinct URLs.
 */
export function normalizeSourceUrlForDedupe(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    url.hash = ''

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }

    return url.toString()
  } catch {
    return null
  }
}

/**
 * Best-effort registrable domain extraction.
 *
 * We use a lightweight suffix table to cover common multi-label public suffixes
 * (for example `co.uk`) and fall back to the final two labels otherwise.
 */
export function getRegistrableDomain(hostOrUrl: string): string {
  const hostname = (extractHostname(hostOrUrl) || hostOrUrl)
    .trim()
    .replace(/\.$/, '')
    .toLowerCase()

  if (!hostname) return hostOrUrl
  if (hostname === 'localhost' || looksLikeIpv4(hostname) || hostname.includes(':')) return hostname

  const labels = hostname.replace(/^www\./, '').split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')

  const tailTwo = labels.slice(-2).join('.')
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(tailTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }

  return labels.slice(-2).join('.')
}

export function getFocusModeLabel(focusMode: FocusMode): string {
  switch (focusMode) {
    case 'academic':
      return 'Academic'
    case 'reddit':
      return 'Reddit'
    case 'youtube':
      return 'YouTube'
    case 'news':
      return 'News'
    case 'code':
      return 'Code'
    case 'finance':
      return 'Finance'
    case 'chat':
      return 'Chat'
    case 'all':
    default:
      return 'All'
  }
}

export function getFocusModeSearchModifier(focusMode: FocusMode): string {
  switch (focusMode) {
    case 'academic':
      return ' site:edu OR site:arxiv.org OR site:scholar.google.com'
    case 'reddit':
      return ' site:reddit.com'
    case 'youtube':
      return ' site:youtube.com'
    case 'news':
      return ' (news OR latest OR breaking)'
    case 'code':
      return ' site:github.com OR site:stackoverflow.com OR site:docs OR (code OR api OR library)'
    case 'all':
    default:
      return ''
  }
}

export function buildSearchQueryWithFocus(query: string, focusMode: FocusMode): string {
  return `${query}${getFocusModeSearchModifier(focusMode)}`
}
