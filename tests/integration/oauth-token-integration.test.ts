import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OAuthToken, UserSettings } from '../../src/lib/types'
import * as oauthModule from '../../src/lib/oauth'
import { ensureGoogleAccessToken } from '../../src/lib/google-calendar'
import { ensureOneDriveAccessToken } from '../../src/lib/onedrive-api'
import * as spotifyOauthModule from '../../src/lib/spotify-oauth'
import { getValidSpotifyAccessToken } from '../../src/lib/spotify-api'

const TEST_REFRESH_VALUE = 'rfv1'

function makeDynamicValue(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function makeExpiredToken(overrides: Partial<OAuthToken> = {}): OAuthToken {
  return {
    accessToken: 'oldv1',
    refreshToken: TEST_REFRESH_VALUE,
    expiresAt: Date.now() - 60_000,
    tokenType: 'Bearer',
    ...overrides,
  }
}

function makeSettings(): UserSettings {
  return {
    apiKeys: {},
    oauthTokens: {
      googledrive: makeExpiredToken(),
      onedrive: makeExpiredToken(),
      spotify: makeExpiredToken(),
    },
    oauthClientIds: {
      spotify: 'spotify-client',
    },
    connectedServices: {
      googledrive: true,
      onedrive: true,
      github: false,
      dropbox: false,
      spotify: true,
    },
  }
}

describe('OAuth token integration flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes and persists a Google token through the shared OAuth module', async () => {
    const nextAccessValue = makeDynamicValue()
    const refreshed = {
      accessToken: nextAccessValue,
      expiresAt: Date.now() + 3_600_000,
      tokenType: 'Bearer',
    }
    const refreshSpy = vi.spyOn(oauthModule, 'refreshAccessToken').mockResolvedValue(refreshed)
    const setSettings = vi.fn()

    const accessToken = await ensureGoogleAccessToken(makeSettings(), setSettings)

    expect(refreshSpy).toHaveBeenCalledWith('googleDrive', TEST_REFRESH_VALUE)
    expect(accessToken).toBe(nextAccessValue)
    expect(setSettings).toHaveBeenCalledTimes(1)
  })

  it('refreshes and persists an OneDrive token through the shared OAuth module', async () => {
    const nextAccessValue = makeDynamicValue()
    const refreshed = {
      accessToken: nextAccessValue,
      expiresAt: Date.now() + 3_600_000,
      tokenType: 'Bearer',
    }
    const refreshSpy = vi.spyOn(oauthModule, 'refreshAccessToken').mockResolvedValue(refreshed)
    const setSettings = vi.fn()

    const accessToken = await ensureOneDriveAccessToken(makeSettings(), setSettings)

    expect(refreshSpy).toHaveBeenCalledWith('oneDrive', TEST_REFRESH_VALUE)
    expect(accessToken).toBe(nextAccessValue)
    expect(setSettings).toHaveBeenCalledTimes(1)
  })

  it('refreshes and persists a Spotify token through the Spotify OAuth module', async () => {
    const nextAccessValue = makeDynamicValue()
    const refreshed = {
      accessToken: nextAccessValue,
      expiresAt: Date.now() + 3_600_000,
      tokenType: 'Bearer',
    }
    const refreshSpy = vi.spyOn(spotifyOauthModule, 'refreshSpotifyAccessToken').mockResolvedValue(refreshed)
    const setSettings = vi.fn()

    const accessToken = await getValidSpotifyAccessToken(makeSettings(), setSettings)

    expect(refreshSpy).toHaveBeenCalledWith(TEST_REFRESH_VALUE, 'spotify-client')
    expect(accessToken).toBe(nextAccessValue)
    expect(setSettings).toHaveBeenCalledTimes(1)
  })
})