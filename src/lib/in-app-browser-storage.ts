/**
 * Bookmarks and history for the in-app browser (localStorage; persists in Electron renderer).
 */

export interface BrowserBookmark {
  id: string
  url: string
  title: string
  createdAt: number
}

export interface BrowserHistoryEntry {
  id: string
  url: string
  title: string
  visitedAt: number
}

const BOOKMARKS_KEY = 'in-app-browser-bookmarks-v1'
const HISTORY_KEY = 'in-app-browser-history-v1'
const MAX_HISTORY = 80

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadBookmarks(): BrowserBookmark[] {
  return safeParse<BrowserBookmark[]>(localStorage.getItem(BOOKMARKS_KEY), [])
}

export function saveBookmarks(list: BrowserBookmark[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list))
  } catch {
    /* quota */
  }
}

export function addBookmark(url: string, title: string): BrowserBookmark {
  const list = loadBookmarks()
  const u = url.trim()
  if (!u || u === 'about:blank') {
    throw new Error('Nothing to bookmark')
  }
  if (list.some((b) => b.url === u)) {
    const existing = list.find((b) => b.url === u)!
    return existing
  }
  const b: BrowserBookmark = {
    id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    url: u,
    title: title.trim() || u,
    createdAt: Date.now(),
  }
  list.unshift(b)
  saveBookmarks(list.slice(0, 200))
  return b
}

export function removeBookmark(id: string): void {
  saveBookmarks(loadBookmarks().filter((b) => b.id !== id))
}

export function loadHistory(): BrowserHistoryEntry[] {
  return safeParse<BrowserHistoryEntry[]>(localStorage.getItem(HISTORY_KEY), [])
}

export function appendHistory(url: string, title: string): void {
  const u = url.trim()
  if (!u || u.startsWith('about:')) return
  const list = loadHistory().filter((h) => h.url !== u)
  const entry: BrowserHistoryEntry = {
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    url: u,
    title: title.trim() || u,
    visitedAt: Date.now(),
  }
  list.unshift(entry)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)))
  } catch {
    /* quota */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* ignore */
  }
}
