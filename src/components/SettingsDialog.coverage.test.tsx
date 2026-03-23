import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsDialog } from './SettingsDialog'

const buildAuthUrlMock = vi.fn()

vi.mock('@/lib/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oauth')>()
  return {
    ...actual,
    buildAuthUrl: (provider: string, clientId: string) => buildAuthUrlMock(provider, clientId),
  }
})

function firstDialog() {
  return screen.getAllByRole('dialog')[0]
}

describe('SettingsDialog coverage', () => {
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

  it('shows toast when buildAuthUrl returns empty', async () => {
    buildAuthUrlMock.mockReturnValueOnce('')
    const { toast } = await import('sonner')
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('')
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    const dlg = within(firstDialog())
    await user.click(dlg.getByRole('tab', { name: /OAuth Connections/i }))
    const ids = dlg.getAllByPlaceholderText(/Enter Client ID/i)
    const secrets = dlg.getAllByPlaceholderText(/Enter Client Secret/i)
    await user.type(ids[0], 'id')
    await user.type(secrets[0], 'secret')
    await user.click(dlg.getAllByRole('button', { name: /Connect with OAuth/i })[0])
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    toastError.mockRestore()
  })

  it('renders Cursor IDE placeholder card on OAuth tab', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    const dlg = within(firstDialog())
    await user.click(dlg.getByRole('tab', { name: /OAuth Connections/i }))
    expect(dlg.getAllByText(/Cursor IDE/i).length).toBeGreaterThan(0)
    expect(dlg.getAllByRole('button', { name: /Coming Soon/i })[0]).toBeDisabled()
  })

  it('shows reconnect for expired Google token', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
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
    const dlg = within(firstDialog())
    await user.click(dlg.getByRole('tab', { name: /OAuth Connections/i }))
    expect(dlg.getByRole('button', { name: /Reconnect/i })).toBeInTheDocument()
  })
})
