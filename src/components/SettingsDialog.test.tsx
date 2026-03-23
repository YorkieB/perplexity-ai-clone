import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsDialog } from './SettingsDialog'

const buildAuthUrlMock = vi.fn((provider: string, clientId: string) => {
  void provider
  void clientId
  return 'https://oauth.example/authorize'
})

vi.mock('@/lib/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oauth')>()
  return {
    ...actual,
    buildAuthUrl: (provider: string, clientId: string) => buildAuthUrlMock(provider, clientId),
  }
})

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    buildAuthUrlMock.mockReturnValue('https://oauth.example/authorize')
    localStorage.setItem(
      'user-settings',
      JSON.stringify({
        apiKeys: {},
        oauthTokens: {},
        oauthClientIds: {},
        oauthClientSecrets: {},
        connectedServices: {
          googledrive: false,
          onedrive: false,
          github: false,
          dropbox: false,
        },
      })
    )
  })

  it('saves API keys from the API Keys tab', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText(/Access Key/i), 'my-secret-key-12345678')
    await user.click(screen.getByRole('button', { name: /Save API Keys/i }))

    const stored = JSON.parse(localStorage.getItem('user-settings') || '{}')
    expect(stored.apiKeys?.digitalOcean).toContain('my-secret')
  })

  it('saves OAuth credentials and invokes connect flow', async () => {
    const user = userEvent.setup()
    const hrefSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost/') as unknown as Location,
    })
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      set: hrefSpy,
      get: () => 'http://localhost/',
    })

    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: /OAuth Connections/i }))

    const clientIds = screen.getAllByLabelText(/^Client ID$/i)
    const secrets = screen.getAllByLabelText(/^Client Secret$/i)
    await user.type(clientIds[0], 'id')
    await user.type(secrets[0], 'secret')

    await user.click(screen.getAllByRole('button', { name: /Connect with OAuth/i })[0])

    await waitFor(() => {
      expect(buildAuthUrlMock).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(hrefSpy).toHaveBeenCalledWith('https://oauth.example/authorize')
    })
  })

  it('disconnects a connected Google Drive account', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'user-settings',
      JSON.stringify({
        apiKeys: {},
        oauthTokens: {
          googledrive: {
            accessToken: 't',
            expiresAt: Date.now() + 999999,
            tokenType: 'Bearer',
          },
        },
        oauthClientIds: {},
        oauthClientSecrets: {},
        connectedServices: {
          googledrive: true,
          onedrive: false,
          github: false,
          dropbox: false,
        },
      })
    )

    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: /OAuth Connections/i }))
    await user.click(screen.getByRole('button', { name: /^Disconnect$/i }))
    const stored = JSON.parse(localStorage.getItem('user-settings') || '{}')
    expect(stored.connectedServices?.googledrive).toBe(false)
  })

  it('shows reconnect when token is expired', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'user-settings',
      JSON.stringify({
        apiKeys: {},
        oauthTokens: {
          googledrive: {
            accessToken: 't',
            expiresAt: Date.now() - 1000,
            tokenType: 'Bearer',
          },
        },
        oauthClientIds: { googledrive: 'cid' },
        oauthClientSecrets: { googledrive: 'sec' },
        connectedServices: {
          googledrive: true,
          onedrive: false,
          github: false,
          dropbox: false,
        },
      })
    )

    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: /OAuth Connections/i }))
    expect(screen.getAllByText(/Token Expired/i).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Reconnect/i }))
    expect(buildAuthUrlMock).toHaveBeenCalled()
  })
})
