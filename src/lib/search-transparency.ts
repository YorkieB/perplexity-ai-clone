import type { FocusMode, Source } from './types'

const MULTIPART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'co.jp',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.mx',
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

export interface GroupedSourceItem {
  source: Source
  index: number
}

export interface SourceDomainGroup {
  domain: string
  items: GroupedSourceItem[]
}

export function getFocusModeLabel(mode: FocusMode): string {
  return FOCUS_MODE_LABELS[mode] ?? 'All Sources'
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

export function buildSearchQueryForFocusMode(query: string, focusMode: FocusMode): string {
  return query + getFocusModeSearchModifier(focusMode)
}

function stripLeadingWww(hostname: string): string {
  return hostname.toLowerCase().startsWith('www.') ? hostname.slice(4) : hostname
}

function getHost(rawUrl: string): string {
  try {
    return stripLeadingWww(new URL(rawUrl).hostname.toLowerCase())
  } catch {
    return rawUrl
  }
}

function isIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    if (!part || part.length > 3) return false
    for (const char of part) {
      if (char < '0' || char > '9') return false
    }
    const numeric = Number(part)
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 255) return false
  }
  return true
}

function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.charAt(end - 1) === '/') {
    end -= 1
  }
  return value.slice(0, end)
}

function stripHash(value: string): string {
  const hashIndex = value.indexOf('#')
  if (hashIndex === -1) return value
  return value.slice(0, hashIndex)
}

function collapseWhitespace(value: string): string {
  let result = ''
  let pendingSpace = false

  for (const char of value) {
    const isWhitespace = char <= ' '
    if (isWhitespace) {
      if (result) pendingSpace = true
      continue
    }

    if (pendingSpace) {
      result += ' '
      pendingSpace = false
    }
    result += char
  }

  return result
}

function stripTrailingQuestionPunctuation(value: string): string {
  const punctuation = new Set(['?', '!', '.', ',', ';', ':'])
  let end = value.length
  while (end > 0 && punctuation.has(value.charAt(end - 1))) {
    end -= 1
  }
  return value.slice(0, end)
}

function stripQuoteMarks(value: string): string {
  return value
    .split('“').join('')
    .split('”').join('')
    .split('"').join('')
    .split('\'').join('')
}

function toRegistrableFromHost(hostname: string): string {
  const host = stripLeadingWww(hostname.toLowerCase())
  if (host === 'localhost' || isIpv4(host) || host.includes(':')) {
    return host
  }

  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) {
    return host
  }

  const trailingPair = parts.slice(-2).join('.')
  if (MULTIPART_PUBLIC_SUFFIXES.has(trailingPair) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }

  return parts.slice(-2).join('.')
}

export function getRegistrableDomain(rawUrl: string): string {
  try {
    const host = stripLeadingWww(new URL(rawUrl).hostname.toLowerCase())
    return toRegistrableFromHost(host)
  } catch {
    const fallbackHost = stripLeadingWww(rawUrl.trim().toLowerCase().split('/')[0] ?? '')
    if (fallbackHost.includes('.')) {
      return toRegistrableFromHost(fallbackHost)
    }
    return rawUrl
  }
}

export function normalizeSourceUrl(rawUrl: string): string {
  try {
    const normalized = new URL(rawUrl)
    normalized.hash = ''
    if (
      (normalized.protocol === 'http:' && normalized.port === '80')
      || (normalized.protocol === 'https:' && normalized.port === '443')
    ) {
      normalized.port = ''
    }

    // Trailing slash policy:
    // - keep "/" for origin-only URLs (https://example.com/)
    // - drop trailing slash for non-root paths so /article and /article/ dedupe.
    if (normalized.pathname !== '/' && normalized.pathname.endsWith('/')) {
      normalized.pathname = trimTrailingSlashes(normalized.pathname)
    }
    return normalized.toString()
  } catch {
    const withoutHash = stripHash(rawUrl.trim())
    return withoutHash
  }
}

function resolveSourceDomain(source: Source): string {
  if (source.domain && source.domain.trim()) {
    return source.domain.trim()
  }
  return getHost(source.url)
}

export function dedupeSourcesByNormalizedUrl(sources: Source[]): Source[] {
  const byUrl = new Map<string, { source: Source; confidence: number }>()

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]
    const normalizedUrl = normalizeSourceUrl(source.url)
    const dedupeKey = normalizedUrl || `__invalid_${String(index)}`
    const domain = resolveSourceDomain(source)
    const normalizedSource: Source = {
      ...source,
      url: normalizedUrl || source.url,
      domain,
      favicon: source.favicon ?? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    }

    const confidence = normalizedSource.confidence ?? Number.NEGATIVE_INFINITY
    const existing = byUrl.get(dedupeKey)
    if (!existing) {
      byUrl.set(dedupeKey, { source: normalizedSource, confidence })
      continue
    }

    // Keep first occurrence on ties, but upgrade to highest-confidence entry.
    if (confidence > existing.confidence) {
      byUrl.set(dedupeKey, { source: normalizedSource, confidence })
    }
  }

  return Array.from(byUrl.values(), (entry) => entry.source)
}

export function groupSourcesByRegistrableDomain(sources: Source[]): SourceDomainGroup[] {
  const grouped = new Map<string, GroupedSourceItem[]>()

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]
    const groupDomain = getRegistrableDomain(source.url)
    const existing = grouped.get(groupDomain)
    if (existing) {
      existing.push({ source, index })
    } else {
      grouped.set(groupDomain, [{ source, index }])
    }
  }

  return Array.from(grouped.entries()).map(([domain, items]) => ({
    domain,
    items,
  }))
}

function normalizeQuestionForComparison(input: string): string {
  const compact = collapseWhitespace(input.toLowerCase())
  const withoutQuotes = stripQuoteMarks(compact)
  return stripTrailingQuestionPunctuation(withoutQuotes).trim()
}

export function sanitizeFollowUpQuestions(questions: string[], assistantContent: string): string[] {
  const normalizedAssistant = normalizeQuestionForComparison(assistantContent)
  const seen = new Set<string>()
  const sanitized: string[] = []

  for (const question of questions) {
    const cleaned = collapseWhitespace(question.trim())
    if (!cleaned) continue

    const normalizedQuestion = normalizeQuestionForComparison(cleaned)
    if (!normalizedQuestion || seen.has(normalizedQuestion)) continue
    if (normalizedAssistant.includes(normalizedQuestion)) continue

    seen.add(normalizedQuestion)
    sanitized.push(cleaned)

    if (sanitized.length === 3) break
  }

  return sanitized
}
