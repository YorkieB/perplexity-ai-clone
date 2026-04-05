import { describe, expect, it, vi } from 'vitest'

import type { BrowserControl } from '../../src/contexts/BrowserControlContext'
import { postToThreadsViaBrowser } from '../../src/lib/social-api'

function createBrowserControl(snapshots: string[]): BrowserControl {
  const queue = [...snapshots]
  const snapshot = vi.fn(async () => queue.shift() ?? '')

  return {
    navigate: vi.fn(async () => ({ ok: true, url: 'https://www.threads.net/', title: 'Threads' })),
    snapshot,
    click: vi.fn(async () => ({ ok: true })),
    type: vi.fn(async () => ({ ok: true })),
    extractText: vi.fn(async () => ''),
    scroll: vi.fn(async () => ({ ok: true })),
    goBack: vi.fn(async () => ({ ok: true })),
    goForward: vi.fn(async () => ({ ok: true })),
    getCurrentUrl: vi.fn(() => 'https://www.threads.net/'),
    isOpen: vi.fn(() => true),
    openBrowser: vi.fn(),
    newTab: vi.fn(async () => ({ ok: true, tabId: '1' })),
    switchTab: vi.fn(async () => ({ ok: true })),
    closeTab: vi.fn(async () => ({ ok: true })),
    listTabs: vi.fn(() => []),
  }
}

describe('social-api Threads posting reliability', () => {
  it('uses fallback compose selector and verifies post success before returning success', async () => {
    vi.useFakeTimers()

    const browserControl = createBrowserControl([
      '<button ref="compose-1" placeholder="Create a thread...">compose</button>',
      '<button ref="post-1" aria-label="Post">Post</button>',
      '<div>Your thread was posted</div>',
    ])

    const task = postToThreadsViaBrowser('hello world', browserControl)
    await vi.runAllTimersAsync()

    await expect(task).resolves.toBe('Posted to Threads successfully.')

    expect(browserControl.click).toHaveBeenCalledWith('compose-1')
    expect(browserControl.type).toHaveBeenCalledWith('compose-1', 'hello world')
    expect(browserControl.click).toHaveBeenCalledWith('post-1')

    vi.useRealTimers()
  })

  it('returns manual-check message when post click cannot be confirmed by snapshot', async () => {
    vi.useFakeTimers()

    const browserControl = createBrowserControl([
      '<div ref="compose-2" aria-label="Start thread composer">compose</div>',
      '<button ref="post-2">Post</button>',
      '<div>Composer still open</div>',
    ])

    const task = postToThreadsViaBrowser('hello world', browserControl)
    await vi.runAllTimersAsync()

    await expect(task).resolves.toBe('Clicked Post but could not confirm the post was submitted. Please check Threads manually.')

    vi.useRealTimers()
  })
})
