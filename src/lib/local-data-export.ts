import { PREFERRED_CHAT_MODEL_KEY, PREFERRED_TTS_VOICE_KEY } from '@/lib/chat-preferences'
import { A2E_T2I_REQ_KEY_STORAGE } from '@/lib/a2e-api'

/**
 * Explicit allowlist of app-owned localStorage keys that can be exported.
 * Keep this list in sync with storage keys used across the app.
 */
export const APP_EXPORTABLE_LOCAL_STORAGE_KEYS = [
  'threads',
  'workspaces',
  'user-settings',
  'wake-word-enabled',
  PREFERRED_CHAT_MODEL_KEY,
  PREFERRED_TTS_VOICE_KEY,
  'jarvis-scheduled-posts',
  'in-app-browser-bookmarks-v1',
  'in-app-browser-history-v1',
  'web-browser-modal-last-url',
  'jarvis-ide-recent-workspaces',
  'jarvis-voice-registry',
  A2E_T2I_REQ_KEY_STORAGE,
] as const

export type ExportedLocalStorageEntry = {
  key: string
  raw: string
  parsed: unknown
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function collectAppLocalStorageSnapshot(): ExportedLocalStorageEntry[] {
  if (typeof window === 'undefined') return []
  return APP_EXPORTABLE_LOCAL_STORAGE_KEYS.flatMap((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return []
    return [{ key, raw, parsed: tryParseJson(raw) }]
  })
}

export function downloadAppLocalDataExport(): void {
  if (typeof window === 'undefined') return
  const snapshot = collectAppLocalStorageSnapshot()
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    note:
      'Local export from browser storage. This is a local snapshot only and may include any credentials already saved in user-settings.',
    keys: APP_EXPORTABLE_LOCAL_STORAGE_KEYS,
    entries: snapshot,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `jarvis-local-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}
