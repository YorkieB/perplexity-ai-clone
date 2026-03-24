import { WORLD_RADIO_SEARCH_SEEDS } from '@/lib/tunein-world-seeds'

/** Official TuneIn embedded player base (see https://cms.tunein.com/listen/embedded/). */
const TUNEIN_PLAYER_BASE = 'https://tunein.com/embed/player'

/** Max stations parsed from a single OPML search response (API typically returns &lt; ~100). */
const MAX_PARSE_PER_SEARCH = 500

const WORLDWIDE_BATCH_SIZE = 10

export interface TuneInPreset {
  readonly name: string
  readonly stationId: string
}

/** Curated defaults so the module works out of the box; override via env. */
export const TUNEIN_DEFAULT_PRESETS: readonly TuneInPreset[] = [
  { name: 'Example stream', stationId: 's24939' },
  { name: 'Switch Hits', stationId: 's323596' },
  { name: 'Example stream B', stationId: 's209772' },
]

function normalizeStationId(raw: string): string {
  const t = raw.trim()
  if (!t) return 's24939'
  const id = t.replace(/^\/+|\/+$/g, '')
  return id.startsWith('s') ? id : `s${id}`
}

/**
 * Build the iframe `src` for TuneIn’s embed player.
 * Optional query params: `background=dark`, `autoplay=true` (TuneIn docs).
 */
export function buildTuneInPlayerUrl(
  stationId: string,
  options?: { readonly background?: 'dark' | 'light'; readonly autoplay?: boolean }
): string {
  const id = normalizeStationId(stationId)
  const params = new URLSearchParams()
  if (options?.background === 'light') {
    /* default is light — omit or set explicitly if TuneIn adds param */
  } else {
    params.set('background', 'dark')
  }
  if (options?.autoplay) params.set('autoplay', 'true')
  const q = params.toString()
  const path = `${TUNEIN_PLAYER_BASE}/${id}/`
  return q ? `${path}?${q}` : path
}

/**
 * Use full embed URL from env, or build from `VITE_TUNEIN_STATION_ID` (default first preset).
 */
export function getTuneInEmbedUrlForStation(stationId: string): string {
  const full = import.meta.env.VITE_TUNEIN_EMBED_URL?.trim()
  if (full) {
    return full
  }
  return buildTuneInPlayerUrl(stationId, { background: 'dark' })
}

/** Initial station: `VITE_TUNEIN_STATION_ID`, else first preset. */
export function getDefaultTuneInStationId(presets: readonly TuneInPreset[]): string {
  const fromEnv = import.meta.env.VITE_TUNEIN_STATION_ID?.trim()
  if (fromEnv) return normalizeStationId(fromEnv)
  return presets[0]?.stationId ?? 's24939'
}

/**
 * Optional env: `Label1:s111,Label2:s222` (station IDs with or without `s` prefix).
 */
export function parseTuneInPresetsFromEnv(): TuneInPreset[] {
  const raw = import.meta.env.VITE_TUNEIN_PRESETS?.trim()
  if (!raw) return [...TUNEIN_DEFAULT_PRESETS]

  const out: TuneInPreset[] = []
  for (const part of raw.split(',')) {
    const segment = part.trim()
    if (!segment) continue
    const colon = segment.indexOf(':')
    if (colon <= 0) continue
    const name = segment.slice(0, colon).trim()
    const idPart = segment.slice(colon + 1).trim()
    if (!name || !idPart) continue
    out.push({ name, stationId: normalizeStationId(idPart) })
  }
  return out.length > 0 ? out : [...TUNEIN_DEFAULT_PRESETS]
}

/**
 * RadioTime OPML base URL. Prefer same-origin `/tunein-opml` so the browser never hits CORS
 * (Vite dev + preview proxy, Electron static server, or host rewrites → opml.radiotime.com).
 * Override with full origin if you proxy elsewhere.
 */
function getOpmlBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_TUNEIN_OPML_PROXY?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return '/tunein-opml'
}

export interface TuneInSearchStation {
  readonly name: string
  readonly stationId: string
  readonly subtext?: string
  readonly imageUrl?: string
}

interface OpmlOutlineRow {
  readonly type?: string
  readonly item?: string
  readonly text?: string
  readonly guide_id?: string
  readonly preset_id?: string
  readonly subtext?: string
  readonly image?: string
  readonly URL?: string
}

function extractStationIdFromRow(row: OpmlOutlineRow): string | null {
  const tryId = (raw: string | undefined): string | null => {
    const t = raw?.trim()
    if (!t) return null
    return /^s\d+$/i.test(t) ? normalizeStationId(t) : null
  }
  const fromFields = tryId(row.guide_id) ?? tryId(row.preset_id)
  if (fromFields) return fromFields

  const url = row.URL?.trim() ?? ''
  const fromQuery = /(?:^|[?&])id=(s\d+)/i.exec(url)
  if (fromQuery) return normalizeStationId(fromQuery[1])
  const fromPath = /\/(s\d+)(?:\/?(?:\?|$))/i.exec(url)
  return fromPath ? normalizeStationId(fromPath[1]) : null
}

function rowLooksLikeRadioStation(row: OpmlOutlineRow): boolean {
  if (row.type === 'audio') return true
  if (row.URL?.includes('Tune.ashx') && row.URL.includes('id=s')) return true
  return false
}

function parseOpmlSearchBody(body: OpmlOutlineRow[], limit: number): TuneInSearchStation[] {
  const seen = new Set<string>()
  const out: TuneInSearchStation[] = []

  for (const row of body) {
    if (!rowLooksLikeRadioStation(row)) continue
    if (row.item === 'show' || row.item === 'topic') continue

    const stationId = extractStationIdFromRow(row)
    if (!stationId || seen.has(stationId)) continue
    seen.add(stationId)

    const name = (row.text ?? stationId).trim() || stationId
    out.push({
      name,
      stationId,
      subtext: row.subtext?.trim(),
      imageUrl: row.image?.trim(),
    })
    if (out.length >= limit) break
  }

  return out
}

async function fetchOpmlSearch(
  query: string,
  extraParams: Record<string, string>,
  parseLimit: number
): Promise<TuneInSearchStation[]> {
  const base = getOpmlBaseUrl()
  const params = new URLSearchParams({
    query: query.trim() || 'radio',
    render: 'json',
    ...extraParams,
  })
  const res = await fetch(`${base}/search.ashx?${params}`)
  if (!res.ok) {
    throw new Error(`TuneIn search failed (${res.status})`)
  }

  let data: { body?: OpmlOutlineRow[] }
  try {
    data = (await res.json()) as { body?: OpmlOutlineRow[] }
  } catch {
    throw new Error('TuneIn search returned invalid JSON')
  }

  const body = Array.isArray(data.body) ? data.body : []
  const cap = Math.min(Math.max(parseLimit, 1), MAX_PARSE_PER_SEARCH)
  return parseOpmlSearchBody(body, cap)
}

/**
 * Search TuneIn / RadioTime for playable stations (`s…` ids work in the embed player).
 * Empty `query` defaults to `"radio"`. Retries without `types=s` if the first response parses empty.
 */
export async function searchTuneInStations(query: string, limit = 24): Promise<TuneInSearchStation[]> {
  const q = query.trim() || 'radio'
  const parseLimit = Math.min(Math.max(limit, 96), MAX_PARSE_PER_SEARCH)
  let stations = await fetchOpmlSearch(q, { types: 's' }, parseLimit)
  if (stations.length === 0) {
    stations = await fetchOpmlSearch(q, {}, parseLimit)
  }
  return stations.slice(0, limit)
}

export interface TuneInWorldwideOptions {
  /** Max unique stations to collect (default 4000). */
  readonly maxTotal?: number
  /** Override seed queries (merged from RadioTime search). */
  readonly seedQueries?: readonly string[]
}

/**
 * Merge many RadioTime searches (world regions, genres, cities) into one deduplicated list.
 * Produces thousands of unique stations when the network and API cooperate.
 */
export async function searchTuneInStationsWorldwide(options?: TuneInWorldwideOptions): Promise<TuneInSearchStation[]> {
  const maxTotal = options?.maxTotal ?? 4000
  const seeds = options?.seedQueries ?? WORLD_RADIO_SEARCH_SEEDS
  const seen = new Set<string>()
  const out: TuneInSearchStation[] = []

  for (let i = 0; i < seeds.length && out.length < maxTotal; i += WORLDWIDE_BATCH_SIZE) {
    const batch = seeds.slice(i, i + WORLDWIDE_BATCH_SIZE)
    const results = await Promise.all(
      batch.map((q) =>
        searchTuneInStations(q, MAX_PARSE_PER_SEARCH).catch(() => [] as TuneInSearchStation[])
      )
    )
    for (const list of results) {
      for (const s of list) {
        if (seen.has(s.stationId)) continue
        seen.add(s.stationId)
        out.push(s)
        if (out.length >= maxTotal) return out
      }
    }
  }
  return out
}

let worldwideCatalogCache: TuneInSearchStation[] | null = null
let worldwideCatalogPromise: Promise<TuneInSearchStation[]> | null = null

/** Session cache so the rail does not re-fetch thousands of stations on every navigation. */
export async function getTuneInWorldwideCatalog(maxTotal = 4000): Promise<TuneInSearchStation[]> {
  if (worldwideCatalogCache && worldwideCatalogCache.length > 0) {
    return worldwideCatalogCache.slice(0, maxTotal)
  }
  if (worldwideCatalogPromise) {
    const rows = await worldwideCatalogPromise
    return rows.slice(0, maxTotal)
  }
  worldwideCatalogPromise = searchTuneInStationsWorldwide({ maxTotal })
    .then((rows) => {
      worldwideCatalogCache = rows
      worldwideCatalogPromise = null
      return rows
    })
    .catch((err) => {
      worldwideCatalogPromise = null
      throw err
    })
  return worldwideCatalogPromise
}

/** For tests or “refresh catalog” UI. */
export function clearTuneInWorldwideCatalogCache(): void {
  worldwideCatalogCache = null
  worldwideCatalogPromise = null
}

/** Map env presets to search-shaped rows for fallback UI. */
export function tuneInPresetsAsSearchStations(presets: readonly TuneInPreset[]): TuneInSearchStation[] {
  return presets.map((p) => ({
    name: p.name,
    stationId: p.stationId,
  }))
}

/** Tune.ashx returns stream objects with url, bitrate, reliability, media_type. */
export interface TuneInStreamInfo {
  readonly url: string
  readonly bitrate?: number
  readonly reliability?: number
  readonly media_type?: string
}

/**
 * Resolve direct stream URL(s) for a station via Tune.ashx.
 * Use the returned URL with a native <audio> element for ad-free playback (no TuneIn embed UI).
 */
export async function fetchTuneInStreamUrl(stationId: string): Promise<TuneInStreamInfo | null> {
  const id = normalizeStationId(stationId)
  const base = getOpmlBaseUrl()
  const params = new URLSearchParams({
    id,
    formats: 'aac,mp3',
    render: 'json',
  })
  const res = await fetch(`${base}/Tune.ashx?${params}`)
  if (!res.ok) return null

  let data: { body?: Array<{ url?: string; URL?: string; bitrate?: number; reliability?: number; media_type?: string }> }
  try {
    data = (await res.json()) as typeof data
  } catch {
    return null
  }

  const body = Array.isArray(data?.body) ? data.body : []
  const streams = body
    .map((s) => {
      const raw = (s?.url ?? s?.URL ?? '').trim()
      if (!raw) return null
      return {
        url: raw.replace(/^http:\/\//, 'https://'),
        bitrate: Number(s?.bitrate) || 0,
        reliability: Number(s?.reliability) || 0,
        media_type: String(s?.media_type || 'mp3'),
      }
    })
    .filter((s): s is { url: string; bitrate: number; reliability: number; media_type: string } => s !== null)
  if (streams.length === 0) return null

  const sorted = [...streams].sort((a, b) => (b.reliability - a.reliability) || (b.bitrate - a.bitrate))
  const best = sorted[0]
  return { url: best.url, bitrate: best.bitrate, reliability: best.reliability, media_type: best.media_type }
}

export interface TuneInNowPlaying {
  readonly stationId: string
  readonly song?: string
  readonly artist?: string
}

/**
 * Fetch now-playing metadata (song, artist) via Describe.ashx.
 * Not all stations provide this; returns empty when unavailable.
 */
export async function fetchTuneInNowPlaying(stationId: string): Promise<TuneInNowPlaying> {
  const id = normalizeStationId(stationId)
  const base = getOpmlBaseUrl()
  const params = new URLSearchParams({ id, render: 'json' })
  const res = await fetch(`${base}/Describe.ashx?${params}`)
  if (!res.ok) return { stationId: id, song: undefined, artist: undefined }

  let data: { body?: Array<Record<string, unknown>> }
  try {
    data = (await res.json()) as typeof data
  } catch {
    return { stationId: id, song: undefined, artist: undefined }
  }

  const body = Array.isArray(data?.body) ? data.body : []

  function extract(obj: Record<string, unknown>): { song?: string; artist?: string } {
    const song =
      (typeof obj.current_song === 'string' ? obj.current_song.trim() : '') ||
      (typeof (obj as Record<string, unknown>).currentSong === 'string'
        ? String((obj as Record<string, unknown>).currentSong).trim()
        : '')
    const artist =
      (typeof obj.current_artist === 'string' ? obj.current_artist.trim() : '') ||
      (typeof (obj as Record<string, unknown>).currentArtist === 'string'
        ? String((obj as Record<string, unknown>).currentArtist).trim()
        : '')
    if (song || artist) return { song: song || undefined, artist: artist || undefined }
    const station = obj.station as Record<string, unknown> | undefined
    if (station) return extract(station)
    const children = obj.children as Array<Record<string, unknown>> | undefined
    if (Array.isArray(children)) {
      for (const c of children) {
        const out = extract(c)
        if (out.song || out.artist) return out
      }
    }
    return {}
  }

  for (const item of body) {
    const { song, artist } = extract(item)
    if (song || artist) return { stationId: id, song, artist }
  }
  return { stationId: id, song: undefined, artist: undefined }
}
