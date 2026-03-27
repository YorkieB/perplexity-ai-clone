/**
 * OneDrive API — full file management via Microsoft Graph.
 * Requires scope `Files.ReadWrite.All` + `offline_access`.
 */

import type { UserSettings } from '@/lib/types'
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export interface OneDriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  parentPath: string
  webUrl?: string
  isFolder: boolean
}

export interface OneDriveListResult {
  files: OneDriveFile[]
  nextLink?: string
}

interface GraphItem {
  id?: string
  name?: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
  lastModifiedDateTime?: string
  parentReference?: { path?: string }
  webUrl?: string
}

function mapItem(raw: GraphItem): OneDriveFile {
  return {
    id: raw.id || '',
    name: raw.name || '(untitled)',
    mimeType: raw.file?.mimeType || (raw.folder ? 'folder' : 'application/octet-stream'),
    size: raw.size || 0,
    modifiedTime: raw.lastModifiedDateTime || '',
    parentPath: raw.parentReference?.path?.replace('/drive/root:', '') || '/',
    webUrl: raw.webUrl,
    isFolder: Boolean(raw.folder),
  }
}

export async function ensureOneDriveAccessToken(
  settings: UserSettings,
  setSettings: (fn: (prev: UserSettings) => UserSettings) => void,
): Promise<string | null> {
  let token = settings.oauthTokens?.onedrive
  if (!token?.accessToken) return null

  const clientId = settings.oauthClientIds?.onedrive?.trim()
  const clientSecret = settings.oauthClientSecrets?.onedrive?.trim()

  if (isTokenExpired(token) && token.refreshToken && clientId && clientSecret) {
    const refreshed = await refreshAccessToken('oneDrive', token.refreshToken, clientId, clientSecret)
    if (refreshed) {
      setSettings((prev) => ({
        ...prev,
        oauthTokens: { ...prev.oauthTokens, onedrive: refreshed },
      }))
      token = refreshed
    } else {
      return null
    }
  }

  if (isTokenExpired(token)) return null
  return token.accessToken
}

export async function onedriveListFiles(
  accessToken: string,
  options?: { folderId?: string; maxResults?: number },
): Promise<OneDriveListResult> {
  const top = options?.maxResults || 50
  let url: string
  if (options?.folderId) {
    url = `${GRAPH}/me/drive/items/${options.folderId}/children?$top=${String(top)}&$orderby=lastModifiedDateTime desc`
  } else {
    url = `${GRAPH}/me/drive/root/children?$top=${String(top)}&$orderby=lastModifiedDateTime desc`
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`OneDrive list ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { value?: GraphItem[]; '@odata.nextLink'?: string }
  return {
    files: (data.value ?? []).map(mapItem),
    nextLink: data['@odata.nextLink'],
  }
}

export async function onedriveSearchFiles(
  accessToken: string,
  query: string,
  maxResults = 30,
): Promise<OneDriveFile[]> {
  const top = maxResults
  const url = `${GRAPH}/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=${String(top)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`OneDrive search ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { value?: GraphItem[] }
  return (data.value ?? []).map(mapItem)
}

export async function onedriveReadFile(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const url = `${GRAPH}/me/drive/items/${fileId}/content`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`OneDrive download ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return res.text()
}

export async function onedriveCreateFile(
  accessToken: string,
  parentPath: string,
  fileName: string,
  content: string,
): Promise<OneDriveFile> {
  const safePath = parentPath.startsWith('/') ? parentPath : `/${parentPath}`
  const url = `${GRAPH}/me/drive/root:${safePath}/${encodeURIComponent(fileName)}:/content`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body: content,
  })
  if (!res.ok) throw new Error(`OneDrive create ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapItem((await res.json()) as GraphItem)
}

export async function onedriveCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
): Promise<OneDriveFile> {
  const parentUrl = parentId
    ? `${GRAPH}/me/drive/items/${parentId}/children`
    : `${GRAPH}/me/drive/root/children`

  const res = await fetch(parentUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  })
  if (!res.ok) throw new Error(`OneDrive mkdir ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapItem((await res.json()) as GraphItem)
}

export async function onedriveMoveFile(
  accessToken: string,
  fileId: string,
  newParentId: string,
): Promise<OneDriveFile> {
  const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parentReference: { id: newParentId } }),
  })
  if (!res.ok) throw new Error(`OneDrive move ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapItem((await res.json()) as GraphItem)
}

export async function onedriveRenameFile(
  accessToken: string,
  fileId: string,
  newName: string,
): Promise<OneDriveFile> {
  const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  })
  if (!res.ok) throw new Error(`OneDrive rename ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapItem((await res.json()) as GraphItem)
}

export async function onedriveDeleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`OneDrive delete ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  }
}

export function formatOneDriveFile(f: OneDriveFile): string {
  const icon = f.isFolder ? '📁' : '📄'
  const sizeStr = f.isFolder ? '' : ` (${formatBytes(f.size)})`
  const modified = f.modifiedTime ? ` — modified ${new Date(f.modifiedTime).toLocaleDateString()}` : ''
  const path = f.parentPath === '/' ? '' : ` in ${f.parentPath}`
  return `${icon} ${f.name}${sizeStr}${modified}${path}\n   ID: ${f.id}`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
