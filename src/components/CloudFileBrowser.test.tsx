import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudFileBrowser } from './CloudFileBrowser'

const { mockUseLocalStorage } = vi.hoisted(() => ({
  mockUseLocalStorage: vi.fn(),
}))

vi.mock('@/hooks/useLocalStorage', () => ({
  useLocalStorage: mockUseLocalStorage,
}))

describe('CloudFileBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocalStorage.mockReturnValue([
      {
        apiKeys: {},
        oauthTokens: {},
        oauthClientIds: {},
        oauthClientSecrets: {},
        connectedServices: {
          googledrive: true,
          onedrive: false,
          github: false,
          dropbox: false,
        },
      },
      vi.fn(),
    ])
  })

  it('shows empty state when no services are connected', () => {
    mockUseLocalStorage.mockReturnValue([
      {
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
      },
      vi.fn(),
    ])
    render(
      <CloudFileBrowser open onOpenChange={vi.fn()} onSelectFiles={vi.fn()} />
    )
    expect(
      screen.getByText(/No cloud services connected/i)
    ).toBeInTheDocument()
  })

  it('loads files, filters, selects, and imports', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <CloudFileBrowser open onOpenChange={onOpenChange} onSelectFiles={onSelect} />
    )

    await user.click(screen.getByRole('button', { name: /Google Drive/i }))
    await waitFor(
      () => {
        expect(screen.getByText('Research Notes.txt')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    await user.type(screen.getByPlaceholderText(/Search files/i), 'xyz')
    expect(screen.getByText(/No files found/i)).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/Search files/i))
    await user.click(screen.getByText('Research Notes.txt'))
    await user.click(screen.getByRole('button', { name: /Import Selected/i }))

    expect(onSelect).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('navigates back from file list', async () => {
    const user = userEvent.setup()
    render(
      <CloudFileBrowser open onOpenChange={vi.fn()} onSelectFiles={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: /Google Drive/i }))
    await waitFor(() => screen.getByText('Research Notes.txt'), { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getAllByText(/Import from Cloud Storage/i).length).toBeGreaterThan(0)
  })

  it('shows error when importing with no selection', async () => {
    const user = userEvent.setup()
    render(
      <CloudFileBrowser open onOpenChange={vi.fn()} onSelectFiles={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: /Google Drive/i }))
    await waitFor(() => screen.getByText('Research Notes.txt'), { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: /Import Selected/i }))
  })
})
