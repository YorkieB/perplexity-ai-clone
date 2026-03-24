import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Music2 } from 'lucide-react'

import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { fetchMyPlaylists, getValidSpotifyAccessToken } from '@/lib/spotify-api'
import {
  getDefaultSpotifyContentRef,
  getSpotifyEmbedUrlForContent,
  parseSpotifyContentRef,
  parseSpotifyPresetsFromEnv,
  presetEmbedHeight,
  type SpotifyPreset,
} from '@/lib/spotify-embed'
import type { UserSettings } from '@/lib/types'

function hasSpotifyFullEmbedOverride(): boolean {
  return Boolean(import.meta.env.VITE_SPOTIFY_EMBED_URL?.trim())
}

const defaultUserSettings: UserSettings = {
  apiKeys: {},
  oauthTokens: {},
  oauthClientIds: {},
  oauthClientSecrets: {},
  connectedServices: {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
    spotify: false,
  },
}

/**
 * Spotify official embed (iframe). Configure playlists/tracks via env or use built-in presets.
 * @see https://developer.spotify.com/documentation/embeds
 */
export function MediaPlayerModule() {
  const [settings, setSettings] = useLocalStorage<UserSettings>('user-settings', defaultUserSettings)
  const presets = useMemo(() => parseSpotifyPresetsFromEnv(), [])
  const fixedEmbed = hasSpotifyFullEmbedOverride()
  const [contentRef, setContentRef] = useState(() => getDefaultSpotifyContentRef(presets))
  const [pasteValue, setPasteValue] = useState('')
  const [compact, setCompact] = useState(false)
  const [lightTheme, setLightTheme] = useState(false)
  const [apiPlaylists, setApiPlaylists] = useState<Array<{ id: string; name: string; tracks: { total: number } }>>(
    []
  )
  const [plLoading, setPlLoading] = useState(false)
  const [plError, setPlError] = useState<string | null>(null)

  const spotifyLinked = Boolean(settings?.connectedServices?.spotify && settings?.oauthTokens?.spotify)

  useEffect(() => {
    if (!spotifyLinked || fixedEmbed) {
      setApiPlaylists([])
      setPlError(null)
      return
    }
    let cancelled = false
    void (async () => {
      setPlLoading(true)
      setPlError(null)
      try {
        const access = await getValidSpotifyAccessToken(settings ?? defaultUserSettings, setSettings)
        if (!access || cancelled) return
        const list = await fetchMyPlaylists(access, { limit: 30 })
        if (!cancelled) setApiPlaylists(list)
      } catch (e) {
        if (!cancelled) setPlError(e instanceof Error ? e.message : 'Could not load playlists')
      } finally {
        if (!cancelled) setPlLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spotifyLinked, fixedEmbed, settings?.oauthTokens?.spotify?.expiresAt, settings?.oauthTokens?.spotify?.accessToken])

  const embedSrc = useMemo(
    () =>
      getSpotifyEmbedUrlForContent(contentRef, {
        theme: lightTheme ? 'light' : 'dark',
        utmSource: true,
      }),
    [contentRef, lightTheme]
  )

  const height = presetEmbedHeight(compact)

  return (
    <Card className="gap-3 overflow-hidden py-4 shadow-none">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-emerald-500/15">
              <Music2 className="size-4 text-emerald-500" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base">Spotify</CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground">
                Embed player ·{' '}
                <a
                  href="https://open.spotify.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  open.spotify.com
                  <ExternalLink className="size-2.5" aria-hidden />
                </a>
              </CardDescription>
            </div>
          </div>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Embed
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-0">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {fixedEmbed ? (
            <>
              Using <code className="rounded bg-muted px-1 py-0.5 text-[9px]">VITE_SPOTIFY_EMBED_URL</code> — remove it
              to switch playlists below or set <code className="rounded bg-muted px-1 py-0.5 text-[9px]">VITE_SPOTIFY_CONTENT</code>.
            </>
          ) : (
            <>
              Paste any track or playlist link from Share, or pick a preset. Log in inside the player to hear full tracks
              (Spotify account required).
            </>
          )}
        </p>

        {!fixedEmbed && spotifyLinked && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground">Your playlists (Web API)</p>
            {plLoading && <p className="text-[10px] text-muted-foreground">Loading playlists…</p>}
            {plError && <p className="text-[10px] text-destructive">{plError}</p>}
            {!plLoading && !plError && apiPlaylists.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No playlists returned.</p>
            )}
            {apiPlaylists.length > 0 && (
              <ScrollArea className="max-h-40 rounded-md border border-border">
                <ul className="space-y-0.5 p-1">
                  {apiPlaylists.map((pl) => {
                    const ref = `playlist/${pl.id}`
                    const active = contentRef === ref
                    return (
                      <li key={pl.id}>
                        <button
                          type="button"
                          onClick={() => setContentRef(ref)}
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? 'bg-emerald-500/15 font-medium text-foreground'
                              : 'text-foreground/90 hover:bg-muted/60'
                          }`}
                        >
                          <span className="truncate">{pl.name}</span>
                          <span className="shrink-0 pl-2 text-[10px] text-muted-foreground">
                            {pl.tracks.total} tracks
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}
        {!fixedEmbed && !spotifyLinked && (
          <p className="text-[10px] text-muted-foreground">
            Connect Spotify in Settings → OAuth to list your playlists here (PKCE, Client ID only).
          </p>
        )}

        {fixedEmbed ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="spotify-paste" className="text-[10px] text-muted-foreground">
              Paste link or Spotify URI
            </Label>
            <div className="flex gap-2">
              <Input
                id="spotify-paste"
                type="text"
                placeholder="https://open.spotify.com/playlist/… or spotify:track:…"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const parsed = parseSpotifyContentRef(pasteValue)
                  if (parsed) {
                    setContentRef(`${parsed.type}/${parsed.id}`)
                    setPasteValue('')
                  }
                }}
                className="h-8 text-xs"
              />
              <button
                type="button"
                className="shrink-0 rounded-md border border-border bg-background px-2.5 text-[10px] font-medium hover:bg-muted"
                onClick={() => {
                  const parsed = parseSpotifyContentRef(pasteValue)
                  if (parsed) {
                    setContentRef(`${parsed.type}/${parsed.id}`)
                    setPasteValue('')
                  }
                }}
              >
                Load
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Switch id="spotify-compact" checked={compact} onCheckedChange={setCompact} />
            <Label htmlFor="spotify-compact" className="cursor-pointer text-[10px] font-normal">
              Compact
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="spotify-light" checked={lightTheme} onCheckedChange={setLightTheme} />
            <Label htmlFor="spotify-light" className="cursor-pointer text-[10px] font-normal">
              Light theme
            </Label>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-black/5 dark:bg-white/5">
          <iframe
            key={embedSrc}
            title="Spotify embed"
            src={embedSrc}
            width="100%"
            height={height}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full border-0"
            style={{ minHeight: compact ? 152 : 200 }}
          />
        </div>

        {fixedEmbed ? null : (
          <PresetList
            presets={presets}
            contentRef={contentRef}
            onSelect={setContentRef}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface PresetListProps {
  readonly presets: readonly SpotifyPreset[]
  readonly contentRef: string
  readonly onSelect: (ref: string) => void
}

function PresetList({ presets, contentRef, onSelect }: PresetListProps) {
  return (
    <ul className="space-y-1.5">
      {presets.map((p) => {
        const active = p.pathOrUrl === contentRef
        return (
          <li key={`${p.name}-${p.pathOrUrl}`}>
            <button
              type="button"
              onClick={() => onSelect(p.pathOrUrl)}
              className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                active
                  ? 'border-emerald-500/40 bg-emerald-500/10 font-medium text-foreground'
                  : 'border-transparent text-foreground/90 hover:border-border hover:bg-muted/50'
              }`}
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 pl-2 font-mono text-[10px] text-muted-foreground">{p.pathOrUrl}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
