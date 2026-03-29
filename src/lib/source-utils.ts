import type { Source } from './types'

/**
 * Normalize source URLs for deduplication:
 * - strip hash fragments
 * - trim trailing slash for non-root paths
 * - lowercase hostnames
 */
export function normalizeSourceUrl(rawUrl: string): string {
  const input = rawUrl.trim()
  if (!input) return input

  try {
    const url = new URL(input)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()

    // Keep "/" for root, but normalize "/path/" -> "/path" to dedupe equivalents.
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      while (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1)
      }
    }

    return url.toString()
  } catch {
    return input
  }
}

export function dedupeSourcesByNormalizedUrl(sources: Source[]): Source[] {
  const deduped = new Map<string, Source>()

  for (const source of sources) {
    const normalizedUrl = normalizeSourceUrl(source.url)
    const existing = deduped.get(normalizedUrl)

    if (!existing) {
      deduped.set(normalizedUrl, source)
      continue
    }

    // Keep the highest-confidence result; preserve first occurrence on ties.
    const existingScore = existing.confidence ?? Number.NEGATIVE_INFINITY
    const nextScore = source.confidence ?? Number.NEGATIVE_INFINITY
    if (nextScore > existingScore) {
      deduped.set(normalizedUrl, source)
    }
  }

  return Array.from(deduped.values())
}

export function getSourceHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return rawUrl
  }
}

const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'net',
  'ne',
  'or',
  'org',
])

/**
 * Best-effort registrable domain extraction (without a public suffix dependency).
 * Examples:
 * - foo.docs.example.com -> example.com
 * - api.example.co.uk -> example.co.uk
 */
export function getRegistrableDomain(rawUrl: string): string {
  const hostname = getSourceHostname(rawUrl)
  const labels = hostname.split('.').filter(Boolean)

  if (labels.length <= 2) return hostname

  const topLevel = labels[labels.length - 1]
  const secondLevel = labels[labels.length - 2]
  const thirdLevel = labels[labels.length - 3]

  const isLikelyCompoundCctld =
    topLevel.length === 2 &&
    COMMON_SECOND_LEVEL_SUFFIXES.has(secondLevel) &&
    Boolean(thirdLevel)

  return isLikelyCompoundCctld ? labels.slice(-3).join('.') : labels.slice(-2).join('.')
}

export interface SourceGroup {
  domain: string
  entries: Array<{
    source: Source
    citationIndex: number
  }>
}

export function groupSourcesByRegistrableDomain(sources: Source[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>()

  for (const [index, source] of sources.entries()) {
    const domain = getRegistrableDomain(source.url || source.domain || 'unknown')
    const existing = groups.get(domain)
    const entry = {
      source,
      citationIndex: index + 1,
    }

    if (existing) {
      existing.entries.push(entry)
      continue
    }

    groups.set(domain, {
      domain,
      entries: [entry],
    })
  }

  return Array.from(groups.values())
}
