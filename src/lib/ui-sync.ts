import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import type { Thread, UserSettings, Workspace } from '@/lib/types'

/** Keys mirrored to SQLite via `/api/ui-sync` (same DB as Jarvis memory). */
export const UI_SYNC_STORAGE_KEYS = ['user-settings', 'threads', 'wake-word-enabled', 'workspaces'] as const

export function shouldPushUiSync(
  threads: Thread[],
  workspaces: Workspace[],
  userSettings: UserSettings,
  wakeWordEnabled: boolean,
): boolean {
  if (wakeWordEnabled) return true
  if (threads.length > 0) return true
  if (workspaces.length > 0) return true
  try {
    return JSON.stringify(userSettings) !== JSON.stringify(DEFAULT_USER_SETTINGS)
  } catch {
    return true
  }
}

/** Run before React mounts so `useLocalStorage` reads hydrated values. */
export async function hydrateUiSyncFromServer(): Promise<void> {
  try {
    const r = await fetch('/api/ui-sync', { credentials: 'same-origin' })
    if (!r.ok) return
    const data = (await r.json()) as { entries?: Record<string, string> }
    const entries = data.entries
    if (!entries || typeof entries !== 'object') return
    for (const key of UI_SYNC_STORAGE_KEYS) {
      const v = entries[key]
      if (typeof v === 'string') localStorage.setItem(key, v)
    }
  } catch {
    /* offline or no backend */
  }
}
