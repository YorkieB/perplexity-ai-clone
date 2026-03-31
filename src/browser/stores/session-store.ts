import type { BrowserSession, BrowserTab } from '@/browser/types'
import { STORAGE_SESSION } from '@/browser/constants'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function tabFromPartial(t: Partial<BrowserTab> & { id: string }): BrowserTab {
  const now = Date.now()
  return {
    id: t.id,
    url: typeof t.url === 'string' ? t.url : 'about:blank',
    title: typeof t.title === 'string' ? t.title : 'New tab',
    faviconUrl: t.faviconUrl,
    isActive: Boolean(t.isActive),
    isPinned: Boolean(t.isPinned),
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : now,
    lastActiveAt: typeof t.lastActiveAt === 'number' ? t.lastActiveAt : now,
  }
}

export function loadBrowserSession(): BrowserSession | null {
  const raw = localStorage.getItem(STORAGE_SESSION)
  const parsed = safeParse<Partial<BrowserSession> | null>(raw, null)
  if (!parsed || !Array.isArray(parsed.tabs)) return null
  const now = Date.now()
  return {
    tabs: parsed.tabs.map((t) => tabFromPartial(t as BrowserTab)),
    activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : now,
    lastUpdatedAt: typeof parsed.lastUpdatedAt === 'number' ? parsed.lastUpdatedAt : now,
  }
}

export function saveBrowserSession(session: BrowserSession): void {
  try {
    localStorage.setItem(
      STORAGE_SESSION,
      JSON.stringify({
        ...session,
        lastUpdatedAt: Date.now(),
      })
    )
  } catch {
    /* quota */
  }
}

export function sessionFromRuntimeState(
  tabs: Array<{
    id: string
    url: string
    title: string
    faviconUrl?: string
    isPinned: boolean
    createdAt: number
    lastActiveAt: number
  }>,
  activeTabId: string
): BrowserSession {
  const now = Date.now()
  return {
    tabs: tabs.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      faviconUrl: t.faviconUrl,
      isActive: t.id === activeTabId,
      isPinned: t.isPinned,
      createdAt: t.createdAt,
      lastActiveAt: t.lastActiveAt,
    })),
    activeTabId,
    createdAt: now,
    lastUpdatedAt: now,
  }
}
