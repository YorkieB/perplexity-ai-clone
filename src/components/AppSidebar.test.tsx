import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppSidebar } from './AppSidebar'
import type { Thread, Workspace } from '@/lib/types'

const { mockUseLocalStorage } = vi.hoisted(() => ({
  mockUseLocalStorage: vi.fn(),
}))

vi.mock('@/hooks/useLocalStorage', () => ({
  useLocalStorage: mockUseLocalStorage,
}))

const thread: Thread = {
  id: 't1',
  title: 'My thread',
  messages: [],
  createdAt: 1,
  updatedAt: 2,
}

const workspace: Workspace = {
  id: 'w1',
  name: 'Space',
  description: '',
  customSystemPrompt: '',
  createdAt: 1,
}

const baseProps = {
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
  activeThreadId: null as string | null,
  activeWorkspaceId: null as string | null,
  onThreadSelect: vi.fn(),
  onWorkspaceSelect: vi.fn(),
  onNewThread: vi.fn(),
  onNewWorkspace: vi.fn(),
  onOpenSettings: vi.fn(),
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocalStorage
      .mockReturnValueOnce([[thread], vi.fn()])
      .mockReturnValueOnce([[workspace], vi.fn()])
  })

  it('renders thread and workspace entries', () => {
    render(<AppSidebar {...baseProps} />)
    expect(screen.getByText('AI Search')).toBeInTheDocument()
    expect(screen.getByText('My thread')).toBeInTheDocument()
    expect(screen.getByText('Space')).toBeInTheDocument()
  })

  it('calls onThreadSelect when a thread row is clicked', async () => {
    const user = userEvent.setup()
    render(<AppSidebar {...baseProps} />)
    const threadButtons = screen.getAllByRole('button', { name: /My thread/i })
    await user.click(threadButtons[0])
    expect(baseProps.onThreadSelect).toHaveBeenCalledWith('t1')
  })
})
