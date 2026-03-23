import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadDropboxFile,
  downloadGitHubFile,
  downloadGoogleDriveFile,
  downloadOneDriveFile,
  fetchDropboxFiles,
  fetchGitHubFiles,
  fetchGoogleDriveFiles,
  fetchOneDriveFiles,
} from './cloudServices'
import type { OAuthToken } from './oauth'

const token: OAuthToken = {
  accessToken: 'tok',
  expiresAt: Date.now() + 99999,
  tokenType: 'Bearer',
}

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Err',
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob(['file-body']),
  } as Response
}

describe('fetchDropboxFiles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps file entries', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        entries: [
          { '.tag': 'file', id: '1', name: 'a.txt', size: 3, path_display: '/a.txt', server_modified: '2020-01-01' },
          { '.tag': 'file', id: '3', name: 'README', size: 1, path_display: '/README', server_modified: '2020-01-01' },
          { '.tag': 'folder', id: '2', name: 'x', size: 0, path_display: '/x', server_modified: '2020-01-01' },
        ],
      })
    )
    const files = await fetchDropboxFiles(token)
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('a.txt')
  })

  it('returns [] on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false))
    expect(await fetchDropboxFiles(token)).toEqual([])
  })

  it('returns [] on throw', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('x'))
    expect(await fetchDropboxFiles(token)).toEqual([])
  })
})

describe('fetchGoogleDriveFiles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps files', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        files: [
          {
            id: '1',
            name: 'doc.pdf',
            mimeType: 'application/pdf',
            size: '100',
            modifiedTime: '2020-01-01T00:00:00Z',
          },
          {
            id: '2',
            name: 'noname',
            mimeType: 'text/plain',
            modifiedTime: '2020-01-01T00:00:00Z',
          },
        ],
      })
    )
    const files = await fetchGoogleDriveFiles(token)
    expect(files[0].source).toBe('googledrive')
    expect(files[1].size).toBe(0)
  })

  it('returns [] on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false))
    expect(await fetchGoogleDriveFiles(token)).toEqual([])
  })
})

describe('fetchOneDriveFiles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns [] on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false))
    expect(await fetchOneDriveFiles(token)).toEqual([])
  })

  it('filters items with file metadata', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: '1',
            name: 'a.md',
            size: 10,
            file: { mimeType: 'text/markdown' },
            lastModifiedDateTime: '2020-01-01T00:00:00Z',
          },
          {
            id: '3',
            name: 'noext',
            size: 3,
            file: { mimeType: '' },
            lastModifiedDateTime: '2020-01-01T00:00:00Z',
          },
          { id: '2', name: 'folder', size: 0, lastModifiedDateTime: '2020-01-01T00:00:00Z' },
        ],
      })
    )
    const files = await fetchOneDriveFiles(token)
    expect(files.length).toBeGreaterThanOrEqual(2)
  })
})

describe('fetchGitHubFiles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('walks repos and file contents', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse([{ full_name: 'u/r' }])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { type: 'file', sha: 's', name: 'README.md', size: 5, path: 'README.md' },
          { type: 'dir', sha: '', name: 'src', size: 0, path: 'src' },
        ])
      )
    const files = await fetchGitHubFiles(token)
    expect(files.length).toBeGreaterThan(0)
    expect(files[0].source).toBe('github')
  })

  it('returns [] when repos request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false))
    expect(await fetchGitHubFiles(token)).toEqual([])
  })

  it('continues when a repo contents fetch throws', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([{ full_name: 'u/r' }]))
      .mockRejectedValueOnce(new Error('bad'))
    const files = await fetchGitHubFiles(token)
    expect(Array.isArray(files)).toBe(true)
  })

  it('skips repo when contents returns not ok', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([{ full_name: 'u/r' }]))
      .mockResolvedValueOnce(jsonResponse({}, false))
    const files = await fetchGitHubFiles(token)
    expect(files).toEqual([])
  })
})

describe('download helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('downloadDropboxFile returns text from blob', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['content']),
    } as Response)
    await expect(downloadDropboxFile('id', '/p', token)).resolves.toBe('content')
  })

  it('downloadDropboxFile rethrows on failure', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, statusText: 'nope' } as Response)
    await expect(downloadDropboxFile('id', '/p', token)).rejects.toThrow()
  })

  it('downloadGoogleDriveFile returns text', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => 'gd',
    } as Response)
    await expect(downloadGoogleDriveFile('id', token)).resolves.toBe('gd')
  })

  it('downloadOneDriveFile returns text', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => 'od',
    } as Response)
    await expect(downloadOneDriveFile('id', token)).resolves.toBe('od')
  })

  it('downloadGitHubFile returns text', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => 'gh',
    } as Response)
    await expect(downloadGitHubFile('o/r/path', token)).resolves.toBe('gh')
  })

  it('downloadGoogleDriveFile throws on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('x'))
    await expect(downloadGoogleDriveFile('id', token)).rejects.toThrow('x')
  })

  it('downloadGoogleDriveFile throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Bad',
      text: async () => 'e',
    } as Response)
    await expect(downloadGoogleDriveFile('id', token)).rejects.toThrow('Bad')
  })

  it('downloadOneDriveFile throws on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('x'))
    await expect(downloadOneDriveFile('id', token)).rejects.toThrow('x')
  })

  it('downloadOneDriveFile throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Bad',
      text: async () => '',
    } as Response)
    await expect(downloadOneDriveFile('id', token)).rejects.toThrow('Bad')
  })

  it('downloadGitHubFile throws on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('x'))
    await expect(downloadGitHubFile('p', token)).rejects.toThrow('x')
  })

  it('downloadGitHubFile throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Nope',
      text: async () => '',
    } as Response)
    await expect(downloadGitHubFile('p', token)).rejects.toThrow('Nope')
  })
})
