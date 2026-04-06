export const APP_OWNED_LOCAL_STORAGE_KEYS = [
  'threads',
  'workspaces',
  'user-settings',
  'wake-word-enabled',
  'preferred-chat-model',
  'preferred-tts-voice',
  'auto-model-enabled',
] as const

export interface LocalDataExportPayload {
  exportedAt: string
  appOwnedKeys: readonly string[]
  warning: string
  data: Record<string, unknown>
}

function parseStoredValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue)
  } catch {
    return rawValue
  }
}

export function buildLocalDataExportPayload(storage: Storage = localStorage): LocalDataExportPayload {
  const data: Record<string, unknown> = {}
  for (const key of APP_OWNED_LOCAL_STORAGE_KEYS) {
    const rawValue = storage.getItem(key)
    if (rawValue !== null) {
      data[key] = parseStoredValue(rawValue)
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    appOwnedKeys: APP_OWNED_LOCAL_STORAGE_KEYS,
    warning: 'Contains only locally stored app data. Any API keys/tokens saved in settings are included because they are already stored in your browser.',
    data,
  }
}

export function downloadLocalDataExport(storage: Storage = localStorage): string {
  const payload = buildLocalDataExportPayload(storage)
  const stamp = payload.exportedAt.replace(/[:.]/g, '-')
  const filename = `jarvis-local-data-export-${stamp}.json`
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return filename
}
