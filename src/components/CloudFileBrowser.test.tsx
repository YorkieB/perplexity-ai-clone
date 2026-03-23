import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudFileBrowser } from './CloudFileBrowser'

const { mockUseLocalStorage } = vi.hoisted(() => ({
  mockUseLocalStorage: vi.fn(),
}))

vi.mock('@/hooks/useLocalStorage', () => ({
  useLocalStorage: mockUseLocalStorage,
}))

function firstDialog() {
  return screen.getAllByRole('dialog')[0]
}

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

  it('shows loading state then files using fake timers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<CloudFileBrowser open onOpenChange={vi.fn()} onSelectFiles={vi.fn()} />)
    await user.click(within(firstDialog()).getByRole('button', { name: /Google Drive/i }))
    expect(within(firstDialog()).getAllByText(/Loading files/i).length).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(1000)
    await waitFor(() => {
      expect(within(firstDialog()).getByText('Research Notes.txt')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('deselects a file when clicked again', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<CloudFileBrowser open onOpenChange={vi.fn()} onSelectFiles={vi.fn()} />)
    await user.click(within(firstDialog()).getByRole('button', { name: /Google Drive/i }))
    await waitFor(() => within(firstDialog()).getByText('Research Notes.txt'), { timeout: 3000 })
    const row = within(firstDialog()).getByText('Research Notes.txt').closest('button')!
    await user.click(row)
    await user.click(row)
    expect(within(firstDialog()).getAllByText(/0 file\(s\) selected/i).length).toBeGreaterThan(0)
  })

  it('closes from Cancel in file list', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    render(<CloudFileBrowser open onOpenChange={onOpenChange} onSelectFiles={vi.fn()} />)
    await user.click(within(firstDialog()).getByRole('button', { name: /Google Drive/i }))
    await waitFor(() => within(firstDialog()).getByText('Research Notes.txt'), { timeout: 3000 })
    await user.click(within(firstDialog()).getByRole('button', { name: /^Cancel$/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
