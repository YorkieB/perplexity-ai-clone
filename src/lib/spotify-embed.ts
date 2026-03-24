/**
 * Spotify iframe embed helpers (no OAuth — uses open.spotify.com/embed).
 * @see https://developer.spotify.com/documentation/embeds
 */

export type SpotifyEmbedType = 'track' | 'playlist' | 'album' | 'episode' | 'show'

export interface SpotifyPreset {
  readonly name: string
  /** `type/id` (e.g. `playlist/37i9dQZF1DXcBWIGoYBM5M`) or any open.spotify.com / spotify: URI */
  readonly pathOrUrl: string
}

/** Works out of the box without env. */
export const SPOTIFY_DEFAULT_PRESETS: readonly SpotifyPreset[] = [
  { name: "Today's Top Hits", pathOrUrl: 'playlist/37i9dQZF1DXcBWIGoYBM5M' },
  { name: 'RapCaviar', pathOrUrl: 'playlist/37i9dQZF1DX0XUsuxWHRQd' },
  { name: 'All Out 2010s', pathOrUrl: 'playlist/37i9dQZF1DX5Ejj0EkURtP' },
]

const SPOTIFY_EMBED_BASE = 'https://open.spotify.com/embed'

/** Path after domain: `track/xxx`, `playlist/xxx`, … */
const PATH_RE = /^(track|playlist|album|episode|show)\/([0-9a-z]+)$/i

/** open.spotify.com URLs (optional `intl-xx` segment). */
const OPEN_URL_RE =
  /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album|episode|show)\/([0-9a-z]+)/i

const SPOTIFY_URI_RE = /^spotify:(track|playlist|album|episode|show):([0-9a-z]+)$/i

function normalizeType(t: string): SpotifyEmbedType | null {
  const x = t.toLowerCase()
  if (x === 'track' || x === 'playlist' || x === 'album' || x === 'episode' || x === 'show') {
    return x
  }
  return null
}

/**
 * Parse a Spotify reference: `type/id`, open URL, or `spotify:…` URI.
 */
export function parseSpotifyContentRef(raw: string): { type: SpotifyEmbedType; id: string } | null {
  const s = raw.trim()
  if (!s) return null

  let m = SPOTIFY_URI_RE.exec(s)
  if (m) {
    const type = normalizeType(m[1])
    if (!type) return null
    return { type, id: m[2] }
  }

  m = OPEN_URL_RE.exec(s)
  if (m) {
    const type = normalizeType(m[1])
    if (!type) return null
    return { type, id: m[2] }
  }

  m = PATH_RE.exec(s)
  if (m) {
    const type = normalizeType(m[1])
    if (!type) return null
    return { type, id: m[2] }
  }

  return null
}

export interface SpotifyEmbedOptions {
  /** `theme=0` dark (default), `theme=1` light */
  readonly theme?: 'dark' | 'light'
  /** Include `utm_source=generator` (matches Share → Embed). */
  readonly utmSource?: boolean
}

/**
 * Build the iframe `src` for Spotify’s embed player.
 */
export function buildSpotifyEmbedUrl(
  type: SpotifyEmbedType,
  id: string,
  options?: SpotifyEmbedOptions
): string {
  const params = new URLSearchParams()
  if (options?.utmSource !== false) {
    params.set('utm_source', 'generator')
  }
  params.set('theme', options?.theme === 'light' ? '1' : '0')
  return `${SPOTIFY_EMBED_BASE}/${type}/${encodeURIComponent(id)}?${params.toString()}`
}

export function spotifyRefToEmbedUrl(ref: string, options?: SpotifyEmbedOptions): string | null {
  const parsed = parseSpotifyContentRef(ref)
  if (!parsed) return null
  return buildSpotifyEmbedUrl(parsed.type, parsed.id, options)
}

/**
 * Full embed URL from env locks the player; otherwise build from a content ref.
 */
export function getSpotifyEmbedUrlForContent(contentRef: string, options?: SpotifyEmbedOptions): string {
  const full = import.meta.env.VITE_SPOTIFY_EMBED_URL?.trim()
  if (full) {
    return full
  }
  const built = spotifyRefToEmbedUrl(contentRef, options)
  return built ?? buildSpotifyEmbedUrl('playlist', '37i9dQZF1DXcBWIGoYBM5M', options)
}

export function getDefaultSpotifyContentRef(presets: readonly SpotifyPreset[]): string {
  const fromEnv = import.meta.env.VITE_SPOTIFY_CONTENT?.trim()
  if (fromEnv) return fromEnv
  return presets[0]?.pathOrUrl ?? 'playlist/37i9dQZF1DXcBWIGoYBM5M'
}

/**
 * Optional env: `Label1:playlist/id1,Label2:https://open.spotify.com/track/…`
 */
export function parseSpotifyPresetsFromEnv(): SpotifyPreset[] {
  const raw = import.meta.env.VITE_SPOTIFY_PRESETS?.trim()
  if (!raw) return [...SPOTIFY_DEFAULT_PRESETS]

  const out: SpotifyPreset[] = []
  for (const part of raw.split(',')) {
    const segment = part.trim()
    if (!segment) continue
    const colon = segment.indexOf(':')
    if (colon <= 0) continue
    const name = segment.slice(0, colon).trim()
    const pathOrUrl = segment.slice(colon + 1).trim()
    if (!name || !pathOrUrl) continue
    if (!parseSpotifyContentRef(pathOrUrl)) continue
    out.push({ name, pathOrUrl })
  }
  return out.length > 0 ? out : [...SPOTIFY_DEFAULT_PRESETS]
}

export function presetEmbedHeight(compact: boolean): number {
  return compact ? 152 : 352
}
