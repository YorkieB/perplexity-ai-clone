import { OAuthToken } from './oauth'
import { CloudFile } from './types'
import { isPathTraversalAttempt } from './url-validation'

interface DropboxListEntry {
  readonly '.tag': string
  id: string
  name: string
  size: number
  path_display: string
  server_modified: string
}

interface GoogleDriveListResponse {
  files: Array<{
    id: string
    name: string
    mimeType: string
    size?: string
    modifiedTime: string
  }>
}

interface OneDriveListResponse {
  value: Array<{
    id: string
    name: string
    size: number
    file?: { mimeType: string }
    lastModifiedDateTime: string
  }>
}

interface GitHubContentItem {
  type: string
  sha: string
  name: string
  size: number
  path: string
}

function validateOpaqueFileId(fileId: string, provider: string): void {
  const normalized = fileId.trim()
  if (!normalized) {
    throw new Error(`${provider} download error: invalid file id`)
  }
  if (normalized.includes('/') || normalized.includes('\\') || normalized.includes('?') || normalized.includes('#')) {
    throw new Error(`${provider} download error: invalid file id`)
  }
  if (isPathTraversalAttempt(normalized) || normalized.includes('\u0000')) {
    throw new Error(`${provider} download error: invalid file id`)
  }
}

function validateDropboxPath(path: string): void {
  const normalized = path.trim()
  if (!normalized) {
    throw new Error('Dropbox download error: invalid file path')
  }
  if (!normalized.startsWith('/')) {
    throw new Error('Dropbox download error: invalid file path')
  }
  if (isPathTraversalAttempt(normalized) || normalized.includes('\u0000')) {
    throw new Error('Dropbox download error: invalid file path')
  }
}

function validateGitHubRepoPath(path: string): void {
  const normalized = path.trim()
  if (!normalized) {
    throw new Error('GitHub download error: invalid repository path')
  }
  if (normalized.startsWith('/') || normalized.includes('?') || normalized.includes('#')) {
    throw new Error('GitHub download error: invalid repository path')
  }
  if (isPathTraversalAttempt(normalized) || normalized.includes('\\') || normalized.includes('\u0000')) {
    throw new Error('GitHub download error: invalid repository path')
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('GitHub download error: invalid repository path')
  }

  const safeSegmentPattern = /^[a-zA-Z0-9._-]+$/
  if (!segments.every((segment) => safeSegmentPattern.test(segment))) {
    throw new Error('GitHub download error: invalid repository path')
  }
}

export async function fetchDropboxFiles(token: OAuthToken): Promise<CloudFile[]> {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: '',
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Dropbox API error: ${response.statusText}`)
    }

    const data = (await response.json()) as { entries: DropboxListEntry[] }

    return data.entries
      .filter((entry) => entry['.tag'] === 'file')
      .map((file) => ({
        id: file.id,
        name: file.name,
        type: getMimeType(file.name),
        size: file.size,
        source: 'dropbox' as const,
        path: file.path_display,
        modifiedAt: new Date(file.server_modified).getTime(),
      }))
  } catch (error) {
    console.error('Error fetching Dropbox files:', error)
    return []
  }
}

export async function fetchGoogleDriveFiles(token: OAuthToken): Promise<CloudFile[]> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({
        pageSize: '100',
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
        q: "trashed=false and 'root' in parents",
      }),
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`)
    }

    const data = (await response.json()) as GoogleDriveListResponse

    return data.files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.mimeType,
      size: parseInt(file.size || '0', 10),
      source: 'googledrive' as const,
      path: `/${file.name}`,
      modifiedAt: new Date(file.modifiedTime).getTime(),
    }))
  } catch (error) {
    console.error('Error fetching Google Drive files:', error)
    return []
  }
}

export async function fetchOneDriveFiles(token: OAuthToken): Promise<CloudFile[]> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/drive/root/children',
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`OneDrive API error: ${response.statusText}`)
    }

    const data = (await response.json()) as OneDriveListResponse

    return data.value
      .filter((item) => item.file)
      .map((file) => ({
        id: file.id,
        name: file.name,
        type: file.file!.mimeType || getMimeType(file.name),
        size: file.size,
        source: 'onedrive' as const,
        path: `/${file.name}`,
        modifiedAt: new Date(file.lastModifiedDateTime).getTime(),
      }))
  } catch (error) {
    console.error('Error fetching OneDrive files:', error)
    return []
  }
}

export async function fetchGitHubFiles(token: OAuthToken): Promise<CloudFile[]> {
  try {
    const reposResponse = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=10',
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!reposResponse.ok) {
      throw new Error(`GitHub API error: ${reposResponse.statusText}`)
    }

    const repos = (await reposResponse.json()) as Array<{ full_name: string }>
    const files: CloudFile[] = []

    for (const repo of repos.slice(0, 5)) {
      try {
        const contentsResponse = await fetch(
          `https://api.github.com/repos/${repo.full_name}/contents`,
          {
            headers: {
              'Authorization': `Bearer ${token.accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        )

        if (contentsResponse.ok) {
          const contents = (await contentsResponse.json()) as GitHubContentItem[]

          contents
            .filter((item) => item.type === 'file')
            .slice(0, 10)
            .forEach((file) => {
              files.push({
                id: file.sha,
                name: file.name,
                type: getMimeType(file.name),
                size: file.size,
                source: 'github' as const,
                path: `${repo.full_name}/${file.path}`,
                modifiedAt: Date.now(),
              })
            })
        }
      } catch (error) {
        console.error(`Error fetching contents for ${repo.full_name}:`, error)
      }
    }

    return files
  } catch (error) {
    console.error('Error fetching GitHub files:', error)
    return []
  }
}

export async function downloadDropboxFile(fileId: string, path: string, token: OAuthToken): Promise<string> {
  try {
    validateOpaqueFileId(fileId, 'Dropbox')
    validateDropboxPath(path)

    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    })

    if (!response.ok) {
      throw new Error(`Dropbox download error: ${response.statusText}`)
    }

    const blob = await response.blob()
    return await blob.text()
  } catch (error) {
    console.error('Error downloading Dropbox file:', error)
    throw error
  }
}

export async function downloadGoogleDriveFile(fileId: string, token: OAuthToken): Promise<string> {
  try {
    validateOpaqueFileId(fileId, 'Google Drive')

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Google Drive download error: ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    console.error('Error downloading Google Drive file:', error)
    throw error
  }
}

export async function downloadOneDriveFile(fileId: string, token: OAuthToken): Promise<string> {
  try {
    validateOpaqueFileId(fileId, 'OneDrive')

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`OneDrive download error: ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    console.error('Error downloading OneDrive file:', error)
    throw error
  }
}

export async function downloadGitHubFile(path: string, token: OAuthToken): Promise<string> {
  try {
    validateGitHubRepoPath(path)

    const response = await fetch(
      `https://api.github.com/repos/${path}`,
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Accept': 'application/vnd.github.v3.raw',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`GitHub download error: ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    console.error('Error downloading GitHub file:', error)
    throw error
  }
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const mimeTypes: Record<string, string> = {
    'txt': 'text/plain',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    'md': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html',
    'js': 'text/javascript',
    'ts': 'text/typescript',
    'jsx': 'text/javascript',
    'tsx': 'text/typescript',
    'py': 'text/x-python',
    'java': 'text/x-java',
    'cpp': 'text/x-c++src',
    'c': 'text/x-csrc',
    'h': 'text/x-chdr',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
  }
  
  return mimeTypes[ext || ''] || 'application/octet-stream'
}
