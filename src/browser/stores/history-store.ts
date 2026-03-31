import { randomIdSegment } from '@/lib/secure-random'
import type { HistoryEntry } from '@/browser/types'
import { LEGACY_HISTORY, MAX_HISTORY_ENTRIES, STORAGE_HISTORY } from '@/browser/constants'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

type LegacyEntry = { id: string; url: string; title: string; visitedAt: number }

function migrateLegacyHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(LEGACY_HISTORY)
  const list = safeParse<LegacyEntry[]>(raw, [])
  return list.map((h) => ({
    id: h.id,
    url: h.url,
    title: h.title,
    visitTime: h.visitedAt,
    visitCount: 1,
  }))
}

export function loadHistory(): HistoryEntry[] {
  let list = safeParse<HistoryEntry[]>(localStorage.getItem(STORAGE_HISTORY), [])
  if (list.length === 0) {
    const migrated = migrateLegacyHistory()
    if (migrated.length > 0) {
      list = migrated
      saveHistory(list)
      try {
        localStorage.removeItem(LEGACY_HISTORY)
      } catch {
        /* ignore */
      }
    }
  }
  return list
}

export function saveHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, MAX_HISTORY_ENTRIES)))
  } catch {
    /* quota */
  }
}

export function recordHistoryVisit(url: string, title: string): void {
  const u = url.trim()
  if (!u || u.startsWith('about:')) return
  const list = loadHistory()
  const now = Date.now()
  const idx = list.findIndex((h) => h.url === u)
  if (idx >= 0) {
    const cur = list[idx]
    const next: HistoryEntry = {
      ...cur,
      title: title.trim() || cur.title,
      visitTime: now,
      visitCount: cur.visitCount + 1,
    }
    list.splice(idx, 1)
    list.unshift(next)
  } else {
    list.unshift({
      id: `h_${now}_${randomIdSegment()}`,
      url: u,
      title: title.trim() || u,
      visitTime: now,
      visitCount: 1,
    })
  }
  saveHistory(list)
}

export type HistoryClearRange = 'hour' | 'day' | 'week' | 'all'

export function clearHistoryRange(range: HistoryClearRange): void {
  if (range === 'all') {
    try {
      localStorage.removeItem(STORAGE_HISTORY)
    } catch {
      /* ignore */
    }
    return
  }
  let ms = 7 * 86400_000
  if (range === 'hour') ms = 3600_000
  else if (range === 'day') ms = 86400_000
  const cutoff = Date.now() - ms
  saveHistory(loadHistory().filter((h) => h.visitTime < cutoff))
}

export function filterHistory(
  list: HistoryEntry[],
  query: string
): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (h) =>
      h.url.toLowerCase().includes(q) ||
      h.title.toLowerCase().includes(q)
  )
}
