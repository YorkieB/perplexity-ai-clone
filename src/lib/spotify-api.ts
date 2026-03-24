import { isTokenExpired } from '@/lib/oauth'
import { refreshSpotifyAccessToken } from '@/lib/spotify-oauth'
import type { OAuthToken, UserSettings } from '@/lib/types'

export interface SpotifyPlaylistSummary {
  readonly id: string
  readonly name: string
  readonly tracks: { total: number }
}

interface SpotifyPlaylistsResponse {
  items: Array<{
    id: string
    name: string
    tracks: { total: number }
  }>
}

/**
 * Returns a usable access token, refreshing via PKCE refresh_token when needed.
 */
export async function getValidSpotifyAccessToken(
  settings: UserSettings,
  setSettings: (update: (prev: UserSettings) => UserSettings) => void
): Promise<string | null> {
  const token = settings.oauthTokens?.spotify
  const clientId = settings.oauthClientIds?.spotify?.trim()
  if (!token || !clientId) return null

  if (!isTokenExpired(token)) {
    return token.accessToken
  }

  if (!token.refreshToken) return null

  const fresh = await refreshSpotifyAccessToken(token.refreshToken, clientId)
  if (!fresh) return null

  setSettings((prev) => ({
    ...prev,
    oauthTokens: {
      ...prev.oauthTokens,
      spotify: mergeRefresh(prev.oauthTokens?.spotify, fresh),
    },
  }))

  return fresh.accessToken
}

function mergeRefresh(prev: OAuthToken | undefined, next: OAuthToken): OAuthToken {
  return {
    ...next,
    refreshToken: next.refreshToken ?? prev?.refreshToken,
  }
}

export async function fetchMyPlaylists(
  accessToken: string,
  options?: { limit?: number; offset?: number }
): Promise<SpotifyPlaylistSummary[]> {
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  const res = await fetch(`https://api.spotify.com/v1/me/playlists?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify playlists: ${res.status} ${text}`)
  }

  const data = (await res.json()) as SpotifyPlaylistsResponse
  return (data.items ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    tracks: { total: p.tracks?.total ?? 0 },
  }))
}
