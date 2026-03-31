import type { BrowserSettings, SitePermissionSet } from '@/browser/types'
import {
  STORAGE_SETTINGS,
  defaultHomepageFromEnv,
  defaultSearchTemplateFromEnv,
} from '@/browser/constants'

/** Older builds defaulted homepage to the app origin — replace with live web. */
function coerceHomepageAwayFromAppShell(url: string | undefined): string {
  const fallback = defaultHomepageFromEnv()
  if (!url?.trim()) return fallback
  const t = url.trim()
  if (t === 'about:blank') return fallback
  if (typeof window !== 'undefined') {
    try {
      const o = window.location.origin
      if (t === o || t === `${o}/`) return fallback
    } catch {
      /* ignore */
    }
  }
  return t
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const searchName = import.meta.env.VITE_JARVIS_BROWSER_SEARCH_NAME?.trim() || 'Bing'

export function defaultBrowserSettings(): BrowserSettings {
  return {
    homepageUrl: defaultHomepageFromEnv(),
    defaultSearchEngine: {
      name: searchName,
      queryUrlTemplate: defaultSearchTemplateFromEnv(),
    },
    openOnStartup: 'last_session',
    showBookmarksBar: true,
    privacy: { sendDoNotTrack: false, blockThirdPartyCookies: false },
    sitePermissions: {},
  }
}

export function loadBrowserSettings(): BrowserSettings {
  const parsed = safeParse<Partial<BrowserSettings>>(
    localStorage.getItem(STORAGE_SETTINGS),
    {}
  )
  const base = defaultBrowserSettings()
  const merged = {
    ...base,
    ...parsed,
    homepageUrl: coerceHomepageAwayFromAppShell(parsed.homepageUrl ?? base.homepageUrl),
    defaultSearchEngine: {
      ...base.defaultSearchEngine,
      ...parsed.defaultSearchEngine,
    },
    privacy: { ...base.privacy, ...parsed.privacy },
    sitePermissions: parsed.sitePermissions && typeof parsed.sitePermissions === 'object'
      ? parsed.sitePermissions
      : {},
  }
  return merged
}

export function saveBrowserSettings(s: BrowserSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(s))
  } catch {
    /* quota */
  }
}

export function mergeSitePermission(
  settings: BrowserSettings,
  origin: string,
  patch: SitePermissionSet
): BrowserSettings {
  const prev = settings.sitePermissions[origin] ?? {}
  return {
    ...settings,
    sitePermissions: {
      ...settings.sitePermissions,
      [origin]: { ...prev, ...patch },
    },
  }
}
