import type { BrowserSession, BrowserTab } from '@/browser/types'

export interface JarvisBrowserImpl {
  openUrl: (url: string, options?: { inNewTab?: boolean }) => Promise<void>
  openNewTab: (url?: string) => Promise<BrowserTab>
  closeTab: (tabId: string) => Promise<void>
  getCurrentSession: () => Promise<BrowserSession>
  getActiveTab: () => Promise<BrowserTab | null>
}

let impl: JarvisBrowserImpl | null = null

export function registerJarvisBrowserImpl(next: JarvisBrowserImpl | null): void {
  impl = next
}

/**
 * Programmatic API for agents / future automation. No-ops when the browser shell is not mounted.
 */
export const JarvisBrowser = {
  async openUrl(url: string, options?: { inNewTab?: boolean }): Promise<void> {
    if (!impl) return
    await impl.openUrl(url, options)
  },

  async openNewTab(url?: string): Promise<BrowserTab> {
    if (!impl) {
      throw new Error('JarvisBrowser: shell not active')
    }
    return impl.openNewTab(url)
  },

  async closeTab(tabId: string): Promise<void> {
    if (!impl) return
    await impl.closeTab(tabId)
  },

  async getCurrentSession(): Promise<BrowserSession> {
    if (!impl) {
      return {
        tabs: [],
        activeTabId: null,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      }
    }
    return impl.getCurrentSession()
  },

  async getActiveTab(): Promise<BrowserTab | null> {
    if (!impl) return null
    return impl.getActiveTab()
  },
}
