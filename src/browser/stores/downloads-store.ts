import type { DownloadItem, DownloadStatus } from '@/browser/types'
import { MAX_DOWNLOADS_STORED, STORAGE_DOWNLOADS } from '@/browser/constants'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadDownloads(): DownloadItem[] {
  return safeParse<DownloadItem[]>(localStorage.getItem(STORAGE_DOWNLOADS), [])
}

export function saveDownloads(list: DownloadItem[]): void {
  try {
    localStorage.setItem(STORAGE_DOWNLOADS, JSON.stringify(list.slice(0, MAX_DOWNLOADS_STORED)))
  } catch {
    /* quota */
  }
}

export function upsertDownloadItem(patch: DownloadItem): DownloadItem[] {
  const list = loadDownloads()
  const i = list.findIndex((d) => d.id === patch.id)
  if (i >= 0) {
    const prev = list[i]
    list[i] = { ...prev, ...patch, startedAt: prev.startedAt }
  } else {
    list.unshift(patch)
  }
  saveDownloads(list)
  return list
}

export function removeDownload(id: string): void {
  saveDownloads(loadDownloads().filter((d) => d.id !== id))
}

export function mapIpcStatus(s: string): DownloadStatus {
  if (s === 'completed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  return 'in_progress'
}
