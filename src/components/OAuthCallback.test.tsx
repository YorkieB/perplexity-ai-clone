import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OAuthCallback } from './OAuthCallback'

const mockValidate = vi.fn()
const mockExchange = vi.fn()

vi.mock('@/lib/oauth', () => ({
  validateOAuthState: (...args: unknown[]) => mockValidate(...args),
  exchangeCodeForToken: (...args: unknown[]) => mockExchange(...args),
}))

describe('OAuthCallback', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockReset()
    mockExchange.mockReset()
    localStorage.clear()
    localStorage.setItem(
      'user-settings',
      JSON.stringify({
        apiKeys: {},
        oauthTokens: {},
        oauthClientIds: { googledrive: 'cid' },
        oauthClientSecrets: { googledrive: 'sec' },
        connectedServices: {
          googledrive: false,
          onedrive: false,
          github: false,
          dropbox: false,
        },
      })
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location
    window.location = {
      ...originalLocation,
      search: '',
      href: 'http://localhost/oauth/callback',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location
  })

  afterEach(() => {
    window.location = originalLocation
    vi.useRealTimers()
  })

  it('shows error when OAuth provider returns error param', async () => {
    window.location = {
      ...originalLocation,
      search: '?error=access_denied',
      href: 'http://localhost/callback',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location

    const { unmount } = render(<OAuthCallback />)
    await waitFor(() => {
      expect(screen.getAllByText(/Authorization Failed/i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/access_denied/i).length).toBeGreaterThan(0)
    unmount()
  })

  it('shows error when code or state is missing', async () => {
    window.location = {
      ...originalLocation,
      search: '?code=only',
      href: 'http://localhost/',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location
    render(<OAuthCallback />)
    await waitFor(() => {
      expect(
        screen.getByText(/Missing authorization code or state parameter/i)
      ).toBeInTheDocument()
    })
  })

  it('shows error when state is invalid', async () => {
    window.location = {
      ...originalLocation,
      search: '?code=abc&state=bad',
      href: 'http://localhost/',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location
    mockValidate.mockReturnValue(null)
    render(<OAuthCallback />)
    await waitFor(() => {
      expect(screen.getByText(/Invalid or expired OAuth state/i)).toBeInTheDocument()
    })
  })

  it('shows error when exchange returns null', async () => {
    window.location = {
      ...originalLocation,
      search: '?code=abc&state=ok',
      href: 'http://localhost/',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location
    mockValidate.mockReturnValue({
      provider: 'googledrive',
      nonce: 'ok',
      returnUrl: '/',
    })
    mockExchange.mockResolvedValue(null)
    const { unmount } = render(<OAuthCallback />)
    await waitFor(() => {
      expect(
        screen.getAllByText(/Failed to exchange authorization code/i).length
      ).toBeGreaterThan(0)
    })
    unmount()
  })

  it('handles successful token exchange and schedules redirect', async () => {
    window.location = {
      ...originalLocation,
      search: '?code=abc&state=ok',
      href: 'http://localhost/',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location

    mockValidate.mockReturnValue({
      provider: 'googledrive',
      nonce: 'ok',
      returnUrl: '/',
    })
    mockExchange.mockResolvedValue({
      accessToken: 't',
      expiresAt: Date.now() + 10000,
      tokenType: 'Bearer',
    })

    const { unmount } = render(<OAuthCallback />)
    await waitFor(() => {
      expect(mockExchange).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getAllByText(/Authorization Successful/i).length).toBeGreaterThan(0)
    })
    const stored = JSON.parse(localStorage.getItem('user-settings') || '{}')
    expect(stored.oauthTokens?.googledrive?.accessToken).toBe('t')
    vi.useFakeTimers()
    vi.advanceTimersByTime(2100)
    vi.useRealTimers()
    unmount()
  })

  it('return button navigates home on error', async () => {
    const user = userEvent.setup()
    const hrefSetter = vi.fn()
    window.location = {
      ...originalLocation,
      search: '?error=access_denied',
      href: 'http://localhost/',
      assign: vi.fn(),
      replace: vi.fn(),
    } as Location
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      set: hrefSetter,
      get: () => 'http://localhost/',
    })

    const { unmount } = render(<OAuthCallback />)
    await waitFor(() => {
      expect(screen.getAllByText(/Authorization Failed/i).length).toBeGreaterThan(0)
    })
    await user.click(screen.getAllByRole('button', { name: /Return to Application/i })[0])
    expect(hrefSetter).toHaveBeenCalledWith('/')
    unmount()
  })
})
