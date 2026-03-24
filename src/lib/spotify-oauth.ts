import { generateOAuthState } from '@/lib/oauth'
import type { OAuthToken } from '@/lib/types'

const SPOTIFY_AUTH = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN = 'https://accounts.spotify.com/api/token'

const PKCE_VERIFIER_KEY = 'spotify_oauth_code_verifier'

/** Scopes for listing playlists and basic profile (embed playback still uses iframe). */
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  'user-read-private',
].join(' ')

function redirectUri(): string {
  return `${window.location.origin}/oauth/callback`
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function randomVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array.buffer)
}

/**
 * Spotify uses Authorization Code with PKCE (no client secret in the browser).
 */
export async function buildSpotifyAuthUrl(clientId: string): Promise<string | null> {
  const id = clientId.trim()
  if (!id) return null

  const verifier = randomVerifier()
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)

  const challenge = base64UrlEncode(await sha256(verifier))

  const state = generateOAuthState('spotify')
  sessionStorage.setItem('oauth_state', JSON.stringify(state))

  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SPOTIFY_SCOPES,
    state: state.nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  return `${SPOTIFY_AUTH}?${params.toString()}`
}

export async function exchangeSpotifyCodeForToken(
  code: string,
  clientId: string
): Promise<OAuthToken | null> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  if (!verifier) {
    console.error('Spotify PKCE: missing code_verifier')
    return null
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId.trim(),
    code_verifier: verifier,
  })

  try {
    const response = await fetch(SPOTIFY_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      console.error('Spotify token exchange failed:', await response.text())
      return null
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type?: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      tokenType: data.token_type || 'Bearer',
    }
  } catch (e) {
    console.error('Spotify token exchange error:', e)
    return null
  }
}

export async function refreshSpotifyAccessToken(
  refreshToken: string,
  clientId: string
): Promise<OAuthToken | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId.trim(),
  })

  try {
    const response = await fetch(SPOTIFY_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      console.error('Spotify token refresh failed:', await response.text())
      return null
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type?: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      tokenType: data.token_type || 'Bearer',
    }
  } catch (e) {
    console.error('Spotify token refresh error:', e)
    return null
  }
}
