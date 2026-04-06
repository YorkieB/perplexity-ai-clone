import { APP_OWNED_LOCAL_STORAGE_KEYS, buildLocalDataExportPayload } from '@/lib/local-data-export'

describe('buildLocalDataExportPayload', () => {
  it('exports only app-owned allowlisted keys', () => {
    const store = new Map<string, string>([
      ['threads', JSON.stringify([{ id: 't1' }])],
      ['user-settings', JSON.stringify({ includeWebSearch: true })],
      ['unknown-key', 'should-not-export'],
    ])
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
    } as Storage

    const payload = buildLocalDataExportPayload(storageMock)

    expect(payload.appOwnedKeys).toEqual(APP_OWNED_LOCAL_STORAGE_KEYS)
    expect(payload.data).toEqual({
      threads: [{ id: 't1' }],
      'user-settings': { includeWebSearch: true },
    })
    expect(payload.data).not.toHaveProperty('unknown-key')
  })
})
