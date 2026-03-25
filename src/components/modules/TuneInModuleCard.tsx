import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pause, Play, Radio, Search } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  fetchTuneInNowPlaying,
  fetchTuneInStreamUrl,
  getDefaultTuneInStationId,
  getTuneInWorldwideCatalog,
  parseTuneInPresetsFromEnv,
  searchTuneInStations,
  tuneInPresetsAsSearchStations,
  type TuneInSearchStation,
} from '@/lib/tunein'
import { useTuneInControlRegister, type TuneInControl } from '@/contexts/TuneInControlContext'
import { cn } from '@/lib/utils'


function NativePlayButton({
  audioRef,
  streamUrl,
  loading,
  disabled,
}: Readonly<{
  audioRef: React.RefObject<HTMLAudioElement | null>
  streamUrl: string | null
  loading: boolean
  disabled: boolean
}>) {
  const [playing, setPlaying] = useState(false)

  /** New `<audio>` mounts when `streamUrl` changes; re-bind listeners to the current node. */
  useEffect(() => {
    setPlaying(false)
  }, [streamUrl])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onPause)
    setPlaying(!el.paused)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onPause)
    }
  }, [audioRef, streamUrl])

  const handleClick = () => {
    const el = audioRef.current
    if (!el || !streamUrl || disabled) return
    if (el.paused) {
      void el.play().catch(() => {
        /* autoplay / decode — ignore */
      })
    } else {
      el.pause()
    }
  }

  const canPlay = Boolean(streamUrl) && !loading && !disabled

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canPlay}
      className={cn(
        'flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border transition-all',
        'border-slate-700 bg-slate-900 text-white shadow-md shadow-slate-900/15',
        canPlay && 'hover:bg-slate-800 active:scale-[0.98]',
        !canPlay && 'cursor-not-allowed border-slate-300 bg-slate-300 text-slate-500 shadow-none'
      )}
      aria-label={playing ? 'Pause' : 'Play'}
    >
      {loading ? (
        <Loader2 className="size-6 animate-spin text-slate-200" aria-hidden />
      ) : playing ? (
        <Pause className="size-6" aria-hidden />
      ) : (
        <Play className="ml-1 size-7" aria-hidden />
      )}
    </button>
  )
}

/**
 * Live radio: embed-style chrome + native stream (RadioTime OPML search, no API key).
 * Dev: Vite proxies `/tunein-opml` → opml.radiotime.com to avoid CORS.
 */
export function TuneInModuleCard() {
  const [searchInput, setSearchInput] = useState('')
  const [stations, setStations] = useState<TuneInSearchStation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const presets = useMemo(() => parseTuneInPresetsFromEnv(), [])
  const presetFallback = useMemo(() => tuneInPresetsAsSearchStations(presets), [presets])
  const [stationId, setStationId] = useState(() => getDefaultTuneInStationId(presets))

  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamLoading, setStreamLoading] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<{ song?: string; artist?: string } | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const autoplayPendingRef = useRef(false)
  const normalVolumeRef = useRef(1)
  const isDuckedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    void (async () => {
      try {
        const list = await getTuneInWorldwideCatalog(4000)
        if (cancelled) return
        setLoadError(false)
        if (list.length === 0) {
          setStations(presetFallback)
        } else {
          setStations(list)
        }
      } catch {
        if (cancelled) return
        setStations(presetFallback)
        setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [presetFallback])

  const displayedStations = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    let list = stations
    if (q) {
      list = stations.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.subtext?.toLowerCase().includes(q) ?? false)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [stations, searchInput])

  useEffect(() => {
    if (stations.length === 0) return
    setStationId((prev) => {
      if (stations.some((s) => s.stationId === prev)) return prev
      return stations[0].stationId
    })
  }, [stations])

  useEffect(() => {
    let cancelled = false
    setStreamLoading(true)
    setStreamError(false)
    setStreamUrl(null)
    setNowPlaying(null)

    void (async () => {
      try {
        const info = await fetchTuneInStreamUrl(stationId)
        if (cancelled) return
        if (info?.url) {
          setStreamUrl(info.url)
          setStreamError(false)
          if (autoplayPendingRef.current) {
            autoplayPendingRef.current = false
            // Defer play until the new <audio> element mounts (key changes with streamUrl)
            setTimeout(() => { audioRef.current?.play().catch(() => {}) }, 100)
          }
        } else {
          setStreamError(true)
          autoplayPendingRef.current = false
        }
      } catch {
        if (!cancelled) {
          setStreamError(true)
          autoplayPendingRef.current = false
        }
      } finally {
        if (!cancelled) setStreamLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [stationId])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [audioRef, streamUrl])

  useEffect(() => {
    if (streamError || streamLoading) return
    let cancelled = false
    const poll = async () => {
      try {
        const info = await fetchTuneInNowPlaying(stationId)
        if (cancelled) return
        if (info.song || info.artist) {
          setNowPlaying({ song: info.song, artist: info.artist })
        } else {
          setNowPlaying(null)
        }
      } catch {
        if (!cancelled) setNowPlaying(null)
      }
    }
    void poll()
    const interval = playing ? setInterval(poll, 20_000) : undefined
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [playing, stationId, streamError, streamLoading])

  const selectStation = useCallback((s: TuneInSearchStation) => {
    setStationId(s.stationId)
  }, [])

  // ── TuneIn voice control registration ────────────────────────────────────
  const { register, unregister } = useTuneInControlRegister()
  const stationsRef = useRef(stations)
  useEffect(() => { stationsRef.current = stations }, [stations])
  const nowPlayingRef = useRef(nowPlaying)
  useEffect(() => { nowPlayingRef.current = nowPlaying }, [nowPlaying])
  const playingRef = useRef(playing)
  useEffect(() => { playingRef.current = playing }, [playing])

  useEffect(() => {
    const control: TuneInControl = {
      async searchAndPlay(query: string) {
        try {
          const results = await searchTuneInStations(query, 10)
          if (results.length === 0) {
            const local = stationsRef.current.filter(s =>
              s.name.toLowerCase().includes(query.toLowerCase()) ||
              (s.subtext?.toLowerCase().includes(query.toLowerCase()) ?? false)
            )
            if (local.length === 0) return { success: false, error: `No stations found for "${query}"` }
            autoplayPendingRef.current = true
            setStationId(local[0].stationId)
            return { success: true, stationName: local[0].name }
          }
          autoplayPendingRef.current = true
          setStationId(results[0].stationId)
          return { success: true, stationName: results[0].name }
        } catch {
          return { success: false, error: 'Station search failed' }
        }
      },
      pause() {
        audioRef.current?.pause()
      },
      resume() {
        audioRef.current?.play().catch(() => {})
      },
      getStatus() {
        const station = stationsRef.current.find(s => s.stationId === stationId)
        const np = nowPlayingRef.current
        const parts: string[] = []
        if (np?.song) parts.push(np.song)
        if (np?.artist) parts.push(np.artist)
        return {
          playing: playingRef.current,
          stationName: station?.name,
          nowPlaying: parts.length > 0 ? parts.join(' by ') : undefined,
        }
      },
      duck() {
        const el = audioRef.current
        if (!el || isDuckedRef.current) return
        normalVolumeRef.current = el.volume
        isDuckedRef.current = true
        el.volume = Math.min(el.volume, 0.15)
      },
      unduck() {
        const el = audioRef.current
        if (!el || !isDuckedRef.current) return
        isDuckedRef.current = false
        el.volume = normalVolumeRef.current
      },
    }
    register(control)
    return unregister
  }, [register, unregister, stationId])

  const currentStation = useMemo(
    () => stations.find((s) => s.stationId === stationId),
    [stations, stationId]
  )

  const listSummary = useMemo(() => {
    if (loading) return 'Loading catalog…'
    const total = stations.length
    const shown = displayedStations.length
    if (!searchInput.trim()) {
      return `${total.toLocaleString()} stations worldwide`
    }
    if (shown === 0) return 'No matches — clear the filter'
    return `${shown.toLocaleString()} match${shown === 1 ? '' : 'es'} (of ${total.toLocaleString()})`
  }, [loading, stations.length, displayedStations.length, searchInput])

  const scrollingText = useMemo(() => {
    if (streamError) return 'Stream unavailable — try another station'
    if (streamLoading) return 'Connecting…'
    const parts: string[] = [stationId]
    if (nowPlaying?.song || nowPlaying?.artist) {
      const track = [nowPlaying.song, nowPlaying.artist].filter(Boolean).join(' — ')
      if (track) parts.push(track)
    }
    if (parts.length === 1) {
      parts.push(currentStation?.subtext?.trim() || 'Live broadcast')
    }
    return parts.join(' · ')
  }, [streamError, streamLoading, stationId, nowPlaying, currentStation?.subtext])

  const showLiveBadge = !streamError && !streamLoading
  const canScroll = !streamError && !streamLoading && scrollingText.length > 40

  return (
    <Card className="gap-3 overflow-hidden border-border py-4 shadow-none">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-muted">
              <Radio className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base">TuneIn</CardTitle>
              <CardDescription className="text-[10px]">
                Live radio · {listSummary}
              </CardDescription>
            </div>
          </div>
          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Live
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-0">
        <div
          className={cn(
            'relative min-h-[100px] overflow-hidden rounded-lg border border-sky-300/80',
            'bg-gradient-to-br from-sky-200 via-amber-100 to-emerald-200',
            'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]'
          )}
        >
          <audio
            ref={audioRef}
            key={streamUrl ?? 'none'}
            src={streamUrl ?? undefined}
            preload="metadata"
            className="hidden"
            controlsList="nodownload"
          />
          <div
            className="pointer-events-none absolute right-2 top-2 select-none text-[9px] font-bold leading-none tracking-tight text-slate-800"
            aria-hidden
          >
            <span className="inline-block rounded bg-slate-900 px-1 py-0.5 text-white">LIVE</span>
            <span className="ml-px inline-block rounded bg-white px-1 py-0.5 text-slate-900 ring-1 ring-slate-300">
              AIR
            </span>
          </div>
          <div className="flex items-center gap-3 px-3 py-3 pr-20">
            <NativePlayButton
              audioRef={audioRef}
              streamUrl={streamUrl}
              loading={streamLoading}
              disabled={streamError}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="max-w-full truncate text-[15px] font-bold leading-tight text-slate-900">
                  {currentStation?.name ?? 'Live radio'}
                </p>
                {showLiveBadge ? (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-red-600 shadow-[0_0_6px_rgba(220,38,38,0.6)]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">Live</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1 min-h-[2.25rem] overflow-hidden text-[11px] leading-snug text-slate-700">
                {canScroll ? (
                  <div className="flex overflow-hidden">
                    <div
                      className="whitespace-nowrap animate-[tunein-marquee_18s_linear_infinite]"
                      style={{ width: 'max-content' }}
                    >
                      <span className="inline-block pr-8">{scrollingText}</span>
                      <span className="inline-block pr-8" aria-hidden>
                        {scrollingText}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="line-clamp-2">{scrollingText}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
              Merged from many global RadioTime searches — thousands of unique stations. Filter the list or pick any row;
              the player updates above.
              {loadError ? (
                <span className="mt-1 block text-amber-600 dark:text-amber-500">
                  Could not reach the station directory (network or proxy). Showing presets until the connection works.
                </span>
              ) : null}
            </p>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Filter by name, city, genre…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-8 pl-8 text-xs"
                aria-label="Filter radio stations"
              />
            </div>

            <div className="relative">
              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                  <span className="text-xs text-muted-foreground">Loading worldwide catalog…</span>
                </div>
              ) : (
                <ScrollArea className="h-[min(14rem,40vh)] rounded-lg border border-border bg-muted/20 pr-2">
                  <ul className="space-y-1 p-2">
                    {displayedStations.map((s) => {
                      const active = s.stationId === stationId
                      return (
                        <li key={s.stationId}>
                          <button
                            type="button"
                            onClick={() => selectStation(s)}
                            className={cn(
                              'flex w-full gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                              active
                                ? 'border-border bg-muted font-medium text-foreground'
                                : 'border-transparent text-foreground hover:border-border hover:bg-muted/50'
                            )}
                          >
                            {s.imageUrl ? (
                              <img
                                src={s.imageUrl}
                                alt=""
                                className="size-8 shrink-0 rounded object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                                <Radio className="size-3.5 opacity-80" aria-hidden />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 font-medium">{s.name}</span>
                              {s.subtext ? (
                                <span className="mt-0.5 line-clamp-1 block text-[10px] text-muted-foreground">{s.subtext}</span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </>
      </CardContent>
    </Card>
  )
}
