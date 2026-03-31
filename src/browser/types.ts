/**
 * Jarvis in-app browser — shared data models (Chromium webview shell).
 */

export type SitePermissionLevel = 'allow' | 'block' | 'ask'

export interface SitePermissionSet {
  camera?: SitePermissionLevel
  microphone?: SitePermissionLevel
  notifications?: SitePermissionLevel
}

export interface BrowserTab {
  id: string
  url: string
  title: string
  faviconUrl?: string
  isActive: boolean
  isPinned: boolean
  createdAt: number
  lastActiveAt: number
}

export interface BrowserSession {
  tabs: BrowserTab[]
  activeTabId: string | null
  createdAt: number
  lastUpdatedAt: number
}

export interface BookmarkFolder {
  id: string
  name: string
  parentId?: string
  createdAt: number
}

export interface Bookmark {
  id: string
  title: string
  url: string
  folderId?: string
  createdAt: number
  updatedAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  visitTime: number
  visitCount: number
}

export type DownloadStatus = 'in_progress' | 'completed' | 'failed' | 'canceled'

export interface DownloadItem {
  id: string
  url: string
  fileName: string
  status: DownloadStatus
  bytesReceived: number
  totalBytes?: number
  startedAt: number
  finishedAt?: number
  localPath?: string
}

export interface BrowserSettings {
  homepageUrl: string
  defaultSearchEngine: { name: string; queryUrlTemplate: string }
  openOnStartup: 'new_tab' | 'last_session'
  showBookmarksBar: boolean
  privacy: { sendDoNotTrack: boolean; blockThirdPartyCookies: boolean }
  sitePermissions: Record<string, SitePermissionSet>
}
