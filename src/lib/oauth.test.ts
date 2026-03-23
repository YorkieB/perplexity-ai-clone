import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAuthUrl,
  exchangeCodeForToken,
  getOAuthConfig,
  isTokenExpired,
  refreshAccessToken,
  validateOAuthState,
} from './oauth'

describe('getOAuthConfig', () => {
  it('returns null for unknown provider', () => {
    expect(getOAuthConfig('unknown')).toBeNull()
  })

  it('returns config with Dropbox auth URL', () => {
    const c = getOAuthConfig('dropbox')
    expect(c).not.toBeNull()
    expect(c?.authUrl).toContain('dropbox.com')
    expect(c?.scopes?.length).toBeGreaterThan(0)
  })
})

describe('validateOAuthState', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('returns null when no state stored', () => {
    expect(validateOAuthState('abc')).toBeNull()
  })

  it('returns state and clears storage when nonce matches', () => {
    const state = { provider: 'dropbox', nonce: 'n1', returnUrl: '/' }
    sessionStorage.setItem('oauth_state', JSON.stringify(state))
    expect(validateOAuthState('n1')).toEqual(state)
    expect(sessionStorage.getItem('oauth_state')).toBeNull()
  })

  it('returns null when nonce does not match', () => {
    sessionStorage.setItem(
      'oauth_state',
      JSON.stringify({ provider: 'dropbox', nonce: 'n1', returnUrl: '/' })
    )
    expect(validateOAuthState('wrong')).toBeNull()
  })

  it('returns null on corrupt session JSON', () => {
    sessionStorage.setItem('oauth_state', '{')
    expect(validateOAuthState('x')).toBeNull()
  })
})

describe('buildAuthUrl', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('builds URL and stores state for Dropbox', () => {
    const url = buildAuthUrl('dropbox', 'cid')
    expect(url).toContain('dropbox.com')
    expect(url).toContain('client_id=cid')
    expect(sessionStorage.getItem('oauth_state')).toBeTruthy()
  })

  it('adds consent prompt for Google Drive', () => {
    const url = buildAuthUrl('googleDrive', 'cid')
    expect(url).toContain('prompt=consent')
  })

  it('returns null for unknown provider', () => {
    expect(buildAuthUrl('nope', 'c')).toBeNull()
  })
})

describe('exchangeCodeForToken', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as Response)
    )
  })

  it('returns token payload on success', async () => {
    const t = await exchangeCodeForToken('dropbox', 'code', 'id', 'secret')
    expect(t?.accessToken).toBe('at')
    expect(t?.refreshToken).toBe('rt')
  })

  it('defaults expires_in and token_type on exchange when omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'only',
        }),
      } as Response)
    )
    const t = await exchangeCodeForToken('dropbox', 'c', 'i', 's')
    expect(t?.tokenType).toBe('Bearer')
    expect(t?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('omits refresh token when API does not return one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'only',
          expires_in: 60,
          token_type: 'Bearer',
        }),
      } as Response)
    )
    const t = await exchangeCodeForToken('dropbox', 'c', 'i', 's')
    expect(t?.refreshToken).toBeUndefined()
  })

  it('returns null when provider unknown', async () => {
    expect(await exchangeCodeForToken('bad', 'c', 'i', 's')).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'err',
      } as Response)
    )
    expect(await exchangeCodeForToken('dropbox', 'c', 'i', 's')).toBeNull()
  })

  it('returns null on fetch throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await exchangeCodeForToken('dropbox', 'c', 'i', 's')).toBeNull()
  })
})

describe('refreshAccessToken', () => {
  it('returns new tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new',
          expires_in: 100,
          token_type: 'Bearer',
        }),
      } as Response)
    )
    const t = await refreshAccessToken('dropbox', 'old-rt', 'id', 'sec')
    expect(t?.accessToken).toBe('new')
    expect(t?.refreshToken).toBe('old-rt')
  })

  it('defaults token type and expiry when omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'a',
        }),
      } as Response)
    )
    const t = await refreshAccessToken('dropbox', 'rt', 'id', 'sec')
    expect(t?.tokenType).toBe('Bearer')
    expect(t?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('returns null on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' } as Response))
    expect(await refreshAccessToken('dropbox', 'r', 'i', 's')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await refreshAccessToken('dropbox', 'r', 'i', 's')).toBeNull()
  })

  it('returns null when provider is unknown', async () => {
    expect(await refreshAccessToken('unknown-provider', 'r', 'i', 's')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('returns false when token expires in the future', () => {
    expect(
      isTokenExpired({
        accessToken: 'a',
        expiresAt: Date.now() + 600_000,
        tokenType: 'Bearer',
      })
    ).toBe(false)
  })

  it('returns true when within 5 minute buffer of expiry', () => {
    expect(
      isTokenExpired({
        accessToken: 'a',
        expiresAt: Date.now() + 60_000,
        tokenType: 'Bearer',
      })
    ).toBe(true)
  })
})
