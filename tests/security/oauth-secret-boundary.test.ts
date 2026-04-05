import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAuthUrl,
  exchangeCodeForToken,
  generatePKCECodeVerifier,
  refreshAccessToken,
  type OAuthState,
} from '../../src/lib/oauth'
import {
  buildSpotifyAuthUrl,
  exchangeSpotifyCodeForToken,
  refreshSpotifyAccessToken,
} from '../../src/lib/spotify-oauth'

class SessionStorageMock {
  private readonly data = new Map<string, string>()

  clear() {
    this.data.clear()
  }

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('OAuth client secret boundaries', () => {
  const SAMPLE_ACCESS_VALUE = 'okv1'
  const SAMPLE_REFRESH_VALUE = 'rkv1'
  const SAMPLE_CODE_VALUE = 'cv1'
  const SAMPLE_ROTATE_VALUE = 'rv1'

  const sessionStorageMock = new SessionStorageMock()

  beforeEach(() => {
    sessionStorageMock.clear()
    vi.restoreAllMocks()

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorageMock,
    })

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        origin: 'https://app.example.com',
        pathname: '/settings/oauth',
      },
    })

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'https://app.example.com',
        },
      },
    })
  })

  it('stores timestamped OAuth state and preserves safe return path in auth URLs', () => {
    const url = buildAuthUrl('googledrive', 'google-client-id')
    expect(url).toContain('client_id=google-client-id')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')

    const savedState = JSON.parse(sessionStorage.getItem('oauth_state') ?? '{}') as OAuthState
    expect(savedState.provider).toBe('googledrive')
    expect(savedState.returnUrl).toBe('/settings/oauth')
    expect(typeof savedState.createdAt).toBe('number')
  })

  it('generates PKCE code verifiers using URL-safe RFC7636 charset and valid length', () => {
    const verifier = generatePKCECodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('uses the server-side proxy for OAuth code exchange without sending a client secret', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        access_token: SAMPLE_ACCESS_VALUE,
        refresh_token: SAMPLE_REFRESH_VALUE,
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    }))

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const token = await exchangeCodeForToken('github', SAMPLE_CODE_VALUE, 'client-id')

    expect(token?.accessToken).toBe(SAMPLE_ACCESS_VALUE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/oauth/exchange')
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>
    expect(body).toMatchObject({
      provider: 'github',
      code: SAMPLE_CODE_VALUE,
      clientId: 'client-id',
      redirectUri: 'https://app.example.com/oauth/callback',
    })
    expect(body).not.toHaveProperty('clientSecret')
  })

  it('uses the server-side proxy for token refresh without sending a client secret', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        access_token: 'okv2',
        refresh_token: 'rkv2',
        expires_in: 1800,
        token_type: 'Bearer',
      }),
    }))

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const token = await refreshAccessToken('googledrive', SAMPLE_ROTATE_VALUE)

    expect(token?.accessToken).toBe('okv2')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/oauth/refresh')
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>
    expect(body).toMatchObject({
      provider: 'googledrive',
      refreshToken: SAMPLE_ROTATE_VALUE,
    })
    expect(body).not.toHaveProperty('clientSecret')
  })

  it('builds Spotify auth URLs with PKCE and no client secret', async () => {
    const url = await buildSpotifyAuthUrl('spotify-client-id')

    expect(url).toContain('client_id=spotify-client-id')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).not.toContain('client_secret')
    expect(sessionStorage.getItem('spotify_oauth_code_verifier')).toBeTruthy()

    const savedState = JSON.parse(sessionStorage.getItem('oauth_state') ?? '{}') as OAuthState
    expect(savedState.provider).toBe('spotify')
    expect(savedState.returnUrl).toBe('/settings/oauth')
  })

  it('exchanges Spotify codes with PKCE verifier and removes it after use', async () => {
    sessionStorage.setItem('spotify_oauth_code_verifier', 'pkce-verifier')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        access_token: 'spv1',
        refresh_token: 'srv1',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    }))

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const token = await exchangeSpotifyCodeForToken('spotify-code', 'spotify-client-id')

    expect(token?.accessToken).toBe('spv1')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://accounts.spotify.com/api/token')
    const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    expect(params.get('client_id')).toBe('spotify-client-id')
    expect(params.get('code_verifier')).toBe('pkce-verifier')
    expect(params.get('client_secret')).toBeNull()
    expect(sessionStorage.getItem('spotify_oauth_code_verifier')).toBeNull()
  })

  it('refreshes Spotify tokens with client id only and no client secret', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        access_token: 'spv2',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    }))

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })

    const token = await refreshSpotifyAccessToken(SAMPLE_ROTATE_VALUE, 'spotify-client-id')

    expect(token?.accessToken).toBe('spv2')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://accounts.spotify.com/api/token')
    const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    expect(params.get('client_id')).toBe('spotify-client-id')
    expect(params.get('refresh_token')).toBe(SAMPLE_ROTATE_VALUE)
    expect(params.get('client_secret')).toBeNull()
  })
})