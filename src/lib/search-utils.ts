import { FocusMode, Source } from './types'

export interface RankedSourceCandidate {
  source: Source
  score: number
}

const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  'ac.uk',
  'co.uk',
  'gov.uk',
  'org.uk',
  'co.jp',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.mx',
  'co.in',
  'co.kr',
  'com.cn',
  'com.hk',
  'com.sg',
  'com.tr',
])

const FOCUS_MODE_LABELS: Record<FocusMode, string> = {
  all: 'All Sources',
  news: 'News',
  academic: 'Academic',
  code: 'Code',
  finance: 'Finance',
  reddit: 'Reddit',
  youtube: 'YouTube',
  chat: 'Chat Only',
}

function isIpv4Host(hostname: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)
}

function normalizeTextForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * URL normalization policy for source dedupe:
 * - Remove URL hash fragments (`#...`) because they usually point to an in-page anchor.
 * - Keep query string intact (it can materially change page content).
 * - Trim trailing slash only for non-root paths (`/docs/` -> `/docs`, but `/` stays `/`).
 */
export function normalizeSourceUrlForDedup(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    parsed.hash = ''

    const protocol = parsed.protocol.toLowerCase()
    const hostname = parsed.hostname.toLowerCase()
    const isDefaultPort =
      (protocol === 'http:' && parsed.port === '80') ||
      (protocol === 'https:' && parsed.port === '443')
    const port = parsed.port && !isDefaultPort ? `:${parsed.port}` : ''

    let normalizedPath = parsed.pathname || '/'
    if (normalizedPath !== '/') {
      normalizedPath = normalizedPath.replace(/\/+$/, '')
      if (!normalizedPath) normalizedPath = '/'
    }

    return `${protocol}//${hostname}${port}${normalizedPath}${parsed.search}`
  } catch {
    return null
  }
}

export function dedupeRankedSourcesByNormalizedUrl(candidates: RankedSourceCandidate[]): Source[] {
  const bestByNormalizedUrl = new Map<
    string,
    { source: Source; score: number; firstIndex: number }
  >()

  candidates.forEach((candidate, index) => {
    const normalizedUrl = normalizeSourceUrlForDedup(candidate.source.url)
    if (!normalizedUrl) return

    const existing = bestByNormalizedUrl.get(normalizedUrl)
    if (!existing) {
      bestByNormalizedUrl.set(normalizedUrl, {
        source: candidate.source,
        score: candidate.score,
        firstIndex: index,
      })
      return
    }

    if (candidate.score > existing.score) {
      bestByNormalizedUrl.set(normalizedUrl, {
        source: candidate.source,
        score: candidate.score,
        firstIndex: existing.firstIndex,
      })
    }
  })

  return [...bestByNormalizedUrl.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((entry) => entry.source)
}

export function getRegistrableDomain(url: string, fallbackDomain?: string): string {
  const fallback = (fallbackDomain || '').trim().toLowerCase().replace(/^www\./, '')

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (!host) return fallback || url
    if (host === 'localhost' || host.includes(':') || isIpv4Host(host)) return host

    const labels = host.split('.').filter(Boolean)
    if (labels.length <= 2) return host

    const lastTwo = labels.slice(-2).join('.')
    if (COMMON_SECOND_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
      return labels.slice(-3).join('.')
    }
    return lastTwo
  } catch {
    return fallback || url
  }
}

export function getFocusModeLabel(focusMode: FocusMode): string {
  return FOCUS_MODE_LABELS[focusMode] ?? 'All Sources'
}

export function sanitizeFollowUpQuestions(
  questions: string[],
  assistantContent: string,
  maxQuestions = 3,
): string[] {
  const normalizedContent = normalizeTextForComparison(assistantContent)
  const seen = new Set<string>()
  const sanitized: string[] = []

  for (const question of questions) {
    const trimmed = question.trim()
    if (!trimmed) continue

    const normalizedQuestion = normalizeTextForComparison(trimmed.replace(/[?.!]+$/g, ''))
    if (!normalizedQuestion || seen.has(normalizedQuestion)) continue

    if (normalizedContent.includes(normalizedQuestion)) continue

    seen.add(normalizedQuestion)
    sanitized.push(trimmed)

    if (sanitized.length >= maxQuestions) break
  }

  return sanitized
}
