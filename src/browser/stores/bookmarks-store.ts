import { randomIdSegment } from '@/lib/secure-random'
import type { Bookmark, BookmarkFolder } from '@/browser/types'
import { LEGACY_BOOKMARKS, STORAGE_BOOKMARKS, STORAGE_FOLDERS } from '@/browser/constants'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function migrateLegacyBookmarks(): Bookmark[] {
  type Legacy = { id: string; url: string; title: string; createdAt: number }
  const raw = localStorage.getItem(LEGACY_BOOKMARKS)
  const list = safeParse<Legacy[]>(raw, [])
  return list.map((b) => ({
    id: b.id,
    url: b.url,
    title: b.title,
    createdAt: b.createdAt,
    updatedAt: b.createdAt,
  }))
}

export function loadBookmarkFolders(): BookmarkFolder[] {
  return safeParse<BookmarkFolder[]>(localStorage.getItem(STORAGE_FOLDERS), [])
}

export function saveBookmarkFolders(folders: BookmarkFolder[]): void {
  try {
    localStorage.setItem(STORAGE_FOLDERS, JSON.stringify(folders.slice(0, 200)))
  } catch {
    /* quota */
  }
}

export function loadBookmarks(): Bookmark[] {
  let list = safeParse<Bookmark[]>(localStorage.getItem(STORAGE_BOOKMARKS), [])
  if (list.length === 0) {
    const migrated = migrateLegacyBookmarks()
    if (migrated.length > 0) {
      list = migrated
      saveBookmarks(list)
      try {
        localStorage.removeItem(LEGACY_BOOKMARKS)
      } catch {
        /* ignore */
      }
    }
  }
  return list
}

export function saveBookmarks(list: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(list.slice(0, 500)))
  } catch {
    /* quota */
  }
}

export function addBookmark(url: string, title: string, folderId?: string): Bookmark {
  const list = loadBookmarks()
  const u = url.trim()
  if (!u || u === 'about:blank') {
    throw new Error('Nothing to bookmark')
  }
  const now = Date.now()
  const existing = list.find((b) => b.url === u)
  if (existing) {
    const next = { ...existing, title: title.trim() || u, updatedAt: now, folderId: folderId ?? existing.folderId }
    saveBookmarks(list.map((b) => (b.id === existing.id ? next : b)))
    return next
  }
  const b: Bookmark = {
    id: `bm_${now}_${randomIdSegment()}`,
    url: u,
    title: title.trim() || u,
    folderId,
    createdAt: now,
    updatedAt: now,
  }
  list.unshift(b)
  saveBookmarks(list)
  return b
}

export function removeBookmark(id: string): void {
  saveBookmarks(loadBookmarks().filter((b) => b.id !== id))
}

export function upsertFolder(name: string, parentId?: string): BookmarkFolder {
  const folders = loadBookmarkFolders()
  const now = Date.now()
  const f: BookmarkFolder = {
    id: `fld_${now}_${randomIdSegment()}`,
    name: name.trim() || 'Folder',
    parentId,
    createdAt: now,
  }
  folders.push(f)
  saveBookmarkFolders(folders)
  return f
}

export function removeFolder(id: string): void {
  const folders = loadBookmarkFolders().filter((f) => f.id !== id)
  const bookmarks = loadBookmarks().map((b) =>
    b.folderId === id ? { ...b, folderId: undefined } : b
  )
  saveBookmarkFolders(folders)
  saveBookmarks(bookmarks)
}
