/**
 * NOW TV rail: user-curated bookmarks only (no NOW API).
 * Optional `VITE_NOWTV_BOOKMARKS` JSON array — see `.env.example`.
 */

export interface NowTvBookmarkRow {
  readonly title: string
  readonly meta: string
  readonly progress: number
  /** When set, row opens in a new tab */
  readonly href?: string
}

export const NOWTV_DEFAULT_BOOKMARKS: readonly NowTvBookmarkRow[] = [
  { title: 'The Last of Us', meta: 'S2 · Ep3', progress: 62 },
  { title: 'House of the Dragon', meta: 'S1 · Ep8', progress: 100 },
  { title: 'True Detective', meta: 'S4 · Ep1', progress: 14 },
]

/**
 * Parse `VITE_NOWTV_BOOKMARKS` JSON. Returns `null` if empty or invalid.
 * Expected shape: `[{ "title": "…", "meta": "…", "progress": 0-100, "href": "https://…" }]`
 */
export function parseNowTvBookmarksEnv(raw: string | undefined): NowTvBookmarkRow[] | null {
  const s = raw?.trim()
  if (!s) return null
  try {
    const data = JSON.parse(s) as unknown
    if (!Array.isArray(data)) return null
    const out: NowTvBookmarkRow[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      if (!title) continue
      const meta = typeof o.meta === 'string' && o.meta.trim() ? o.meta.trim() : '—'
      let progress = typeof o.progress === 'number' && Number.isFinite(o.progress) ? Math.round(o.progress) : 0
      if (progress < 0) progress = 0
      if (progress > 100) progress = 100
      let href: string | undefined
      if (typeof o.href === 'string' && o.href.trim()) {
        try {
          const u = new URL(o.href.trim())
          if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href
        } catch {
          /* ignore invalid URL */
        }
      }
      out.push({ title, meta, progress, href })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

export function getNowTvBookmarks(): { rows: NowTvBookmarkRow[]; fromEnv: boolean } {
  const raw = import.meta.env.VITE_NOWTV_BOOKMARKS?.trim()
  const parsed = parseNowTvBookmarksEnv(raw)
  if (parsed) return { rows: parsed, fromEnv: true }
  return { rows: [...NOWTV_DEFAULT_BOOKMARKS], fromEnv: false }
}

export function getNowTvHomeUrl(): string {
  const u = import.meta.env.VITE_NOWTV_HOME_URL?.trim()
  if (u) {
    try {
      const parsed = new URL(u)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
    } catch {
      /* fall through */
    }
  }
  return 'https://www.nowtv.com'
}
