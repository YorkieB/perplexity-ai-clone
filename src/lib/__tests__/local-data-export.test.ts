import { describe, expect, it } from '@jest/globals'

import {
  APP_LOCAL_STORAGE_EXPORT_KEYS,
  buildLocalDataExportPayload,
} from '../local-data-export'

describe('buildLocalDataExportPayload', () => {
  it('exports every requested key and parses JSON values', () => {
    const storage = {
      getItem: (key: string) => {
        if (key === 'threads') return '[{"id":"t1"}]'
        if (key === 'preferred-chat-model') return 'gpt-4o-mini'
        return null
      },
    }
    const payload = buildLocalDataExportPayload(storage, ['threads', 'preferred-chat-model', 'missing-key'])
    expect(payload.exportedKeys).toEqual(['threads', 'preferred-chat-model', 'missing-key'])
    expect(payload.data.threads).toEqual([{ id: 't1' }])
    expect(payload.data['preferred-chat-model']).toBe('gpt-4o-mini')
    expect(payload.data['missing-key']).toBeNull()
  })

  it('maintains an explicit app-owned key allowlist', () => {
    expect(APP_LOCAL_STORAGE_EXPORT_KEYS).toContain('threads')
    expect(APP_LOCAL_STORAGE_EXPORT_KEYS).toContain('workspaces')
    expect(APP_LOCAL_STORAGE_EXPORT_KEYS).toContain('user-settings')
  })
})
