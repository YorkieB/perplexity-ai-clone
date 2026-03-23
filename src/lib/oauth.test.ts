import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getOAuthConfig,
  isTokenExpired,
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
