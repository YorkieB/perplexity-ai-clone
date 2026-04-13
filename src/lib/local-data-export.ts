export const APP_LOCAL_STORAGE_EXPORT_KEYS = [
  'threads',
  'workspaces',
  'user-settings',
  'wake-word-enabled',
  'preferred-chat-model',
  'preferred-tts-voice',
  'jarvis-scheduled-posts',
  'jarvis-voice-registry',
  'a2e-t2i-req-key',
  'jarvis-browser-session-v1',
  'jarvis-browser-settings-v1',
  'jarvis-browser-bookmarks-v1',
  'jarvis-browser-bookmark-folders-v1',
  'jarvis-browser-history-v1',
  'jarvis-browser-downloads-v1',
  'in-app-browser-bookmarks-v1',
  'in-app-browser-history-v1',
  'web-browser-modal-last-url',
  'jarvis-ide-recent-workspaces',
  'spotify_oauth_code_verifier',
  'jarvis-health-dashboard-403',
] as const

export interface LocalDataExportPayload {
  exportedAt: string
  exportedKeys: readonly string[]
  data: Record<string, unknown>
}

function parsePossiblyJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function buildLocalDataExportPayload(
  storage: Pick<Storage, 'getItem'>,
  keys: readonly string[] = APP_LOCAL_STORAGE_EXPORT_KEYS,
): LocalDataExportPayload {
  const data: Record<string, unknown> = {}
  for (const key of keys) {
    const raw = storage.getItem(key)
    data[key] = raw === null ? null : parsePossiblyJson(raw)
  }

  return {
    exportedAt: new Date().toISOString(),
    exportedKeys: keys,
    data,
  }
}
