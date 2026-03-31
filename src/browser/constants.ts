/** localStorage keys */
export const STORAGE_SESSION = 'jarvis-browser-session-v1'
export const STORAGE_SETTINGS = 'jarvis-browser-settings-v1'
export const STORAGE_BOOKMARKS = 'jarvis-browser-bookmarks-v1'
export const STORAGE_FOLDERS = 'jarvis-browser-bookmark-folders-v1'
export const STORAGE_HISTORY = 'jarvis-browser-history-v1'
export const STORAGE_DOWNLOADS = 'jarvis-browser-downloads-v1'

/** Legacy keys (migrated once) */
export const LEGACY_BOOKMARKS = 'in-app-browser-bookmarks-v1'
export const LEGACY_HISTORY = 'in-app-browser-history-v1'

export const MAX_TABS = 24
export const MAX_HISTORY_ENTRIES = 500
export const MAX_DOWNLOADS_STORED = 100

/** Default start page for the in-app browser — real HTTPS site (not the app shell). */
export const JARVIS_LIVE_WEB_HOMEPAGE = 'https://www.bing.com/'

/** `{query}` placeholder in template */
export function defaultSearchTemplateFromEnv(): string {
  const t = import.meta.env.VITE_JARVIS_BROWSER_SEARCH_TEMPLATE?.trim()
  if (t) {
    if (t.includes('{query}')) return t
    const sep = t.includes('?') ? '&' : '?'
    return `${t}${sep}q={query}`
  }
  return 'https://www.bing.com/search?q={query}'
}

export function defaultHomepageFromEnv(): string {
  const h = import.meta.env.VITE_JARVIS_BROWSER_HOMEPAGE?.trim()
  if (h) return h
  return JARVIS_LIVE_WEB_HOMEPAGE
}
