import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Bookmark, BrowserSettings, DownloadItem, HistoryEntry, SitePermissionLevel } from '@/browser/types'
import { resolveOmniboxInput } from '@/browser/omnibox'
import {
  loadBookmarkFolders,
  loadBookmarks,
  removeBookmark,
  removeFolder,
  upsertFolder,
} from '@/browser/stores/bookmarks-store'
import {
  clearHistoryRange,
  filterHistory,
  loadHistory,
  type HistoryClearRange,
} from '@/browser/stores/history-store'
import { loadDownloads, removeDownload } from '@/browser/stores/downloads-store'
import { defaultBrowserSettings, loadBrowserSettings, saveBrowserSettings } from '@/browser/stores/settings-store'
import { getElectronInAppBrowser } from '@/browser/electron-browser-bridge'
import { cn } from '@/lib/utils'

export function NewTabPage({
  settings,
  onNavigate,
}: Readonly<{
  settings: BrowserSettings
  onNavigate: (url: string) => void
}>) {
  const [q, setQ] = useState('')
  return (
    <div className="flex min-h-[min(420px,50vh)] flex-col items-center justify-center gap-6 bg-gradient-to-b from-muted/40 to-background px-6 py-12">
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight">Jarvis Browser</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Search the web with {settings.defaultSearchEngine.name} or enter a URL (homepage opens Microsoft Bing by default)
        </p>
      </div>
      <form
        className="flex w-full max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onNavigate(resolveOmniboxInput(q, settings))
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or type a URL"
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit">Go</Button>
      </form>
    </div>
  )
}

export function BookmarksManagerPanel({
  onOpenUrl,
  onChanged,
}: Readonly<{
  onOpenUrl: (url: string) => void
  onChanged: () => void
}>) {
  const [folderName, setFolderName] = useState('')
  const [list, setList] = useState(() => loadBookmarks())
  const [folders, setFolders] = useState(() => loadBookmarkFolders())

  const refresh = () => {
    setList(loadBookmarks())
    setFolders(loadBookmarkFolders())
    onChanged()
  }

  return (
    <ScrollArea className="h-full max-h-[min(560px,62vh)]">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>New folder</Label>
            <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="w-48" />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!folderName.trim()) return
              upsertFolder(folderName.trim())
              setFolderName('')
              refresh()
            }}
          >
            Add folder
          </Button>
        </div>
        <ul className="space-y-2">
          {list.map((b: Bookmark) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                onClick={() => onOpenUrl(b.url)}
              >
                {b.title}
              </button>
              <span className="text-muted-foreground hidden max-w-[200px] truncate font-mono text-xs sm:inline">
                {b.url}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  removeBookmark(b.id)
                  refresh()
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {folders.length > 0 && (
          <div className="text-muted-foreground text-xs">
            Folders:{' '}
            {folders.map((f) => (
              <span key={f.id} className="mr-2 inline-flex items-center gap-1">
                {f.name}
                <button
                  type="button"
                  className="text-destructive underline"
                  onClick={() => {
                    removeFolder(f.id)
                    refresh()
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

export function HistoryManagerPanel({
  onOpenUrl,
  onChanged,
}: Readonly<{
  onOpenUrl: (url: string) => void
  onChanged: () => void
}>) {
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<HistoryClearRange>('hour')
  const list = filterHistory(loadHistory(), query)

  const clear = (r: HistoryClearRange) => {
    clearHistoryRange(r)
    onChanged()
  }

  return (
    <div className="flex h-full max-h-[min(560px,62vh)] flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by title or URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs font-mono text-sm"
        />
        <Select value={range} onValueChange={(v) => setRange(v as HistoryClearRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Clear range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hour">Last hour</SelectItem>
            <SelectItem value="day">Last 24 hours</SelectItem>
            <SelectItem value="week">Last week</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="secondary" size="sm" onClick={() => clear(range)}>
          Clear history
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
        <ul className="divide-y divide-border">
          {list.slice(0, 200).map((h: HistoryEntry) => (
            <li key={h.id}>
              <button
                type="button"
                className="hover:bg-muted/50 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                onClick={() => onOpenUrl(h.url)}
              >
                <span className="text-sm font-medium">{h.title}</span>
                <span className="text-muted-foreground font-mono text-xs">{h.url}</span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(h.visitTime).toLocaleString()} · {h.visitCount} visits
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

export function DownloadsManagerPanel({ onChanged }: Readonly<{ onChanged: () => void }>) {
  const [items, setItems] = useState<DownloadItem[]>(() => loadDownloads())
  const api = getElectronInAppBrowser()

  const refresh = () => {
    setItems(loadDownloads())
    onChanged()
  }

  return (
    <ScrollArea className="h-full max-h-[min(560px,62vh)]">
      <ul className="divide-y divide-border p-2">
        {items.length === 0 ? (
          <li className="text-muted-foreground p-4 text-sm">No downloads recorded yet.</li>
        ) : (
          items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-2 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.fileName}</div>
                <div className="text-muted-foreground font-mono text-xs">{d.status}</div>
              </div>
              {d.localPath && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const p = d.localPath
                      if (p) api?.showItemInFolder?.(p)?.catch(() => {})
                    }}
                  >
                    Show in folder
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const p = d.localPath
                      if (!p) return
                      const ide = window.jarvisIde as { shellOpenPath?: (x: string) => Promise<string> } | undefined
                      ide?.shellOpenPath?.(p)?.catch(() => {})
                    }}
                  >
                    Open
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  removeDownload(d.id)
                  refresh()
                }}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>
    </ScrollArea>
  )
}

function permSelect(
  value: SitePermissionLevel | undefined,
  onChange: (v: SitePermissionLevel) => void
) {
  return (
    <Select value={value ?? 'ask'} onValueChange={(v) => onChange(v as SitePermissionLevel)}>
      <SelectTrigger className="h-8 w-[100px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ask">Ask</SelectItem>
        <SelectItem value="allow">Allow</SelectItem>
        <SelectItem value="block">Block</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function SettingsManagerPanel({
  onSettingsSaved,
}: Readonly<{ onSettingsSaved: (s: BrowserSettings) => void }>) {
  const [s, setS] = useState<BrowserSettings>(() => loadBrowserSettings())
  const [newOrigin, setNewOrigin] = useState('')

  const save = (next: BrowserSettings) => {
    setS(next)
    saveBrowserSettings(next)
    onSettingsSaved(next)
  }

  const origins = Object.keys(s.sitePermissions).sort()

  return (
    <ScrollArea className="h-full max-h-[min(560px,62vh)]">
      <div className="space-y-6 p-4">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">On startup</h3>
          <Select
            value={s.openOnStartup}
            onValueChange={(v) => save({ ...s, openOnStartup: v as BrowserSettings['openOnStartup'] })}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new_tab">New tab</SelectItem>
              <SelectItem value="last_session">Restore last session</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Homepage</h3>
          <Input
            className="font-mono text-sm"
            value={s.homepageUrl}
            onChange={(e) => setS({ ...s, homepageUrl: e.target.value })}
            onBlur={(e) => save({ ...s, homepageUrl: e.target.value })}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Default search</h3>
          <Input
            className="text-sm"
            value={s.defaultSearchEngine.name}
            onChange={(e) =>
              setS({
                ...s,
                defaultSearchEngine: { ...s.defaultSearchEngine, name: e.target.value },
              })
            }
            onBlur={() => save(s)}
            placeholder="Name"
          />
          <Input
            className="font-mono text-sm"
            value={s.defaultSearchEngine.queryUrlTemplate}
            onChange={(e) =>
              setS({
                ...s,
                defaultSearchEngine: { ...s.defaultSearchEngine, queryUrlTemplate: e.target.value },
              })
            }
            onBlur={() => save(s)}
            placeholder="https://…?q={query}"
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Privacy</h3>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="dnt" className="flex-1">
              Send Do Not Track
            </Label>
            <Switch
              id="dnt"
              checked={s.privacy.sendDoNotTrack}
              onCheckedChange={(c) => save({ ...s, privacy: { ...s.privacy, sendDoNotTrack: c } })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="3pc" className="flex-1">
              Block third-party cookies (stored preference; full enforcement depends on Chromium build)
            </Label>
            <Switch
              id="3pc"
              checked={s.privacy.blockThirdPartyCookies}
              onCheckedChange={(c) =>
                save({ ...s, privacy: { ...s.privacy, blockThirdPartyCookies: c } })
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">Bookmarks bar</h3>
            <Switch
              checked={s.showBookmarksBar}
              onCheckedChange={(c) => save({ ...s, showBookmarksBar: c })}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Site permissions</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs font-mono text-sm"
              placeholder="https://example.com"
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                let origin = newOrigin.trim()
                if (!origin) return
                try {
                  if (!origin.includes('://')) origin = `https://${origin}`
                  origin = new URL(origin).origin
                } catch {
                  return
                }
                save({
                  ...s,
                  sitePermissions: {
                    ...s.sitePermissions,
                    [origin]: s.sitePermissions[origin] ?? {},
                  },
                })
                setNewOrigin('')
              }}
            >
              Add origin
            </Button>
          </div>
          <div className="space-y-3">
            {origins.map((origin) => (
              <div
                key={origin}
                className={cn('flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center')}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{origin}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Cam</span>
                  {permSelect(s.sitePermissions[origin]?.camera, (v) =>
                    save({
                      ...s,
                      sitePermissions: {
                        ...s.sitePermissions,
                        [origin]: { ...s.sitePermissions[origin], camera: v },
                      },
                    })
                  )}
                  <span className="text-muted-foreground text-xs">Mic</span>
                  {permSelect(s.sitePermissions[origin]?.microphone, (v) =>
                    save({
                      ...s,
                      sitePermissions: {
                        ...s.sitePermissions,
                        [origin]: { ...s.sitePermissions[origin], microphone: v },
                      },
                    })
                  )}
                  <span className="text-muted-foreground text-xs">Notif</span>
                  {permSelect(s.sitePermissions[origin]?.notifications, (v) =>
                    save({
                      ...s,
                      sitePermissions: {
                        ...s.sitePermissions,
                        [origin]: { ...s.sitePermissions[origin], notifications: v },
                      },
                    })
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = { ...s.sitePermissions }
                      delete next[origin]
                      save({ ...s, sitePermissions: next })
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            save(defaultBrowserSettings())
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </ScrollArea>
  )
}
