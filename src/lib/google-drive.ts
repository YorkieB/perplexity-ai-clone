/**
 * Google Drive API — full file management using the shared Google OAuth token.
 * Requires scope `https://www.googleapis.com/auth/drive`.
 */

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  parents?: string[]
  webViewLink?: string
  isFolder: boolean
}

export interface DriveListResult {
  files: DriveFile[]
  nextPageToken?: string
  totalHint?: string
}

function mapFile(raw: Record<string, unknown>): DriveFile {
  return {
    id: (raw.id as string) || '',
    name: (raw.name as string) || '(untitled)',
    mimeType: (raw.mimeType as string) || 'application/octet-stream',
    size: Number.parseInt((raw.size as string) || '0', 10),
    modifiedTime: (raw.modifiedTime as string) || '',
    parents: raw.parents as string[] | undefined,
    webViewLink: raw.webViewLink as string | undefined,
    isFolder: (raw.mimeType as string) === 'application/vnd.google-apps.folder',
  }
}

export async function driveListFiles(
  accessToken: string,
  options?: {
    folderId?: string
    query?: string
    maxResults?: number
    pageToken?: string
    orderBy?: string
  },
): Promise<DriveListResult> {
  const u = new URL(`${DRIVE_BASE}/files`)
  u.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)')
  u.searchParams.set('pageSize', String(options?.maxResults || 50))
  u.searchParams.set('orderBy', options?.orderBy || 'modifiedTime desc')

  const clauses: string[] = ['trashed=false']
  if (options?.folderId) clauses.push(`'${options.folderId}' in parents`)
  if (options?.query) {
    const escaped = options.query.replaceAll("'", String.raw`\'`)
    clauses.push(`name contains '${escaped}'`)
  }
  u.searchParams.set('q', clauses.join(' and '))
  if (options?.pageToken) u.searchParams.set('pageToken', options.pageToken)

  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Drive list ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { files?: Record<string, unknown>[]; nextPageToken?: string }
  return {
    files: (data.files ?? []).map(mapFile),
    nextPageToken: data.nextPageToken,
  }
}

export async function driveSearchFiles(
  accessToken: string,
  query: string,
  maxResults?: number,
): Promise<DriveFile[]> {
  const u = new URL(`${DRIVE_BASE}/files`)
  u.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)')
  u.searchParams.set('pageSize', String(maxResults || 30))
  u.searchParams.set('orderBy', 'modifiedTime desc')
  const escaped = query.replaceAll("'", String.raw`\'`)
  u.searchParams.set('q', `trashed=false and (name contains '${escaped}' or fullText contains '${escaped}')`)

  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Drive search ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { files?: Record<string, unknown>[] }
  return (data.files ?? []).map(mapFile)
}

export async function driveReadFile(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const metaRes = await fetch(`${DRIVE_BASE}/files/${fileId}?fields=mimeType,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metaRes.ok) throw new Error(`Drive meta ${String(metaRes.status)}: ${(await metaRes.text()).slice(0, 200)}`)
  const meta = (await metaRes.json()) as { mimeType?: string; name?: string }

  const isGoogleDoc = meta.mimeType?.startsWith('application/vnd.google-apps.')
  let downloadUrl: string
  if (isGoogleDoc) {
    downloadUrl = `${DRIVE_BASE}/files/${fileId}/export?mimeType=text/plain`
  } else {
    downloadUrl = `${DRIVE_BASE}/files/${fileId}?alt=media`
  }

  const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Drive download ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return res.text()
}

export async function driveCreateFile(
  accessToken: string,
  name: string,
  content: string,
  options?: { parentId?: string; mimeType?: string },
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: options?.mimeType || 'text/plain',
  }
  if (options?.parentId) metadata.parents = [options.parentId]

  const boundary = '---jarvis-drive-boundary'
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${metadata.mimeType as string}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n')

  const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,parents,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Drive create ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapFile((await res.json()) as Record<string, unknown>)
}

export async function driveCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) metadata.parents = [parentId]

  const res = await fetch(`${DRIVE_BASE}/files?fields=id,name,mimeType,size,modifiedTime,parents,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })
  if (!res.ok) throw new Error(`Drive mkdir ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapFile((await res.json()) as Record<string, unknown>)
}

export async function driveMoveFile(
  accessToken: string,
  fileId: string,
  newParentId: string,
): Promise<DriveFile> {
  const metaRes = await fetch(`${DRIVE_BASE}/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metaRes.ok) throw new Error(`Drive get parents ${String(metaRes.status)}`)
  const meta = (await metaRes.json()) as { parents?: string[] }
  const removeParents = (meta.parents ?? []).join(',')

  const res = await fetch(
    `${DRIVE_BASE}/files/${fileId}?addParents=${newParentId}&removeParents=${removeParents}&fields=id,name,mimeType,size,modifiedTime,parents,webViewLink`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    },
  )
  if (!res.ok) throw new Error(`Drive move ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapFile((await res.json()) as Record<string, unknown>)
}

export async function driveRenameFile(
  accessToken: string,
  fileId: string,
  newName: string,
): Promise<DriveFile> {
  const res = await fetch(
    `${DRIVE_BASE}/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,parents,webViewLink`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    },
  )
  if (!res.ok) throw new Error(`Drive rename ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  return mapFile((await res.json()) as Record<string, unknown>)
}

export async function driveDeleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  }
}

export function formatDriveFile(f: DriveFile): string {
  const icon = f.isFolder ? '📁' : '📄'
  const sizeStr = f.isFolder ? '' : ` (${formatBytes(f.size)})`
  const modified = f.modifiedTime ? ` — modified ${new Date(f.modifiedTime).toLocaleDateString()}` : ''
  return `${icon} ${f.name}${sizeStr}${modified}\n   ID: ${f.id}`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
