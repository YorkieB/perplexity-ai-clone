import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

const FAKE_TOKEN = {
  accessToken: 'tok',
  refreshToken: 'rtok',
  expiresAt: Date.now() + 3600000,
  tokenType: 'Bearer',
}

describe('cloud download input validation', () => {
  it('rejects Dropbox traversal paths before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { downloadDropboxFile } = await import('../../src/lib/cloudServices')

    await expect(downloadDropboxFile('id123', '/safe/../../secret.txt', FAKE_TOKEN)).rejects.toThrow('Dropbox download error: invalid file path')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed Google Drive file id before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { downloadGoogleDriveFile } = await import('../../src/lib/cloudServices')

    await expect(downloadGoogleDriveFile('../bad-id', FAKE_TOKEN)).rejects.toThrow('Google Drive download error: invalid file id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed OneDrive file id before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { downloadOneDriveFile } = await import('../../src/lib/cloudServices')

    await expect(downloadOneDriveFile('bad/id', FAKE_TOKEN)).rejects.toThrow('OneDrive download error: invalid file id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects GitHub path traversal before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { downloadGitHubFile } = await import('../../src/lib/cloudServices')

    await expect(downloadGitHubFile('owner/repo/../../etc/passwd', FAKE_TOKEN)).rejects.toThrow('GitHub download error: invalid repository path')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows valid GitHub repo paths and calls fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('ok') })
    vi.stubGlobal('fetch', fetchMock)

    const { downloadGitHubFile } = await import('../../src/lib/cloudServices')

    await expect(downloadGitHubFile('owner/repo/contents/src/file.ts', FAKE_TOKEN)).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
