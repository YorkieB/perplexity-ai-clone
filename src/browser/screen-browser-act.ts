import { JarvisBrowser } from '@/browser/jarvis-browser-runtime'
import { showBrowserToast } from '@/ui/toast/toast-helpers'

export const BROWSER_ACT_GOAL_CONTINUE = 'continue where you left off in your browser'

export const BROWSER_ACT_GOAL_OPEN_URL = 'open url in browser'

export type BrowserActContinueResult =
  | { mode: 'restored'; tabCount: number }
  | { mode: 'new_tab' }

export type JarvisBrowserActIpcPayload = {
  goal: string
  slots: Record<string, string | undefined>
}

/** True when this ACT goal should run in the renderer (Jarvis browser API + session store live there). */
export function shouldDelegateJarvisBrowserActGoal(goal: string): boolean {
  const n = goal.trim().toLowerCase().replace(/\s+/g, ' ')
  if (n === BROWSER_ACT_GOAL_CONTINUE) return true
  if (n === 'continue where i left off in the browser.') return true
  if (n === 'continue where i left off in the browser') return true
  return n.includes('continue where') && n.includes('left off') && n.includes('browser')
}

export function shouldDelegateOpenUrlBrowserActGoal(goal: string): boolean {
  const n = goal.trim().toLowerCase()
  return n === BROWSER_ACT_GOAL_OPEN_URL || n.startsWith(`${BROWSER_ACT_GOAL_OPEN_URL} `)
}

export function shouldDelegateJarvisBrowserActToRenderer(goal: string): boolean {
  return shouldDelegateJarvisBrowserActGoal(goal) || shouldDelegateOpenUrlBrowserActGoal(goal)
}

export const ScreenBrowserAct = {
  async focusBrowserModal(openBrowserModal: () => void): Promise<void> {
    openBrowserModal()
  },

  async continueWhereLeftOff(openBrowserModal: () => void): Promise<BrowserActContinueResult> {
    openBrowserModal()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 120)
    })

    const session = await JarvisBrowser.getCurrentSession()
    if (session.tabs.length > 0) {
      return { mode: 'restored', tabCount: session.tabs.length }
    }

    try {
      await JarvisBrowser.openNewTab()
    } catch {
      /* shell may still show default new tab */
    }

    return { mode: 'new_tab' }
  },

  async openUrl(url: string, openBrowserModal: () => void): Promise<void> {
    openBrowserModal()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 120)
    })
    await JarvisBrowser.openUrl(url, { inNewTab: true })
  },
}

/**
 * Handles in-app browser ACT goals in the renderer (after main delegates via IPC).
 */
export async function handleBrowserActGoal(
  goal: string,
  slots: Record<string, string | undefined>,
  openBrowserModal: () => void
): Promise<void> {
  const normalised = goal.trim().toLowerCase()

  if (shouldDelegateJarvisBrowserActGoal(goal)) {
    const result = await ScreenBrowserAct.continueWhereLeftOff(openBrowserModal)
    if (result.mode === 'restored') {
      const tabWord = result.tabCount !== 1 ? 's' : ''
      showBrowserToast(
        `Restored your last browser session (${String(result.tabCount)} tab${tabWord}).`,
        'success'
      )
    } else {
      showBrowserToast(
        'No previous browser session to restore; opened a new tab instead.',
        'warning'
      )
    }
    return
  }

  if (shouldDelegateOpenUrlBrowserActGoal(goal)) {
    const fromSlot = typeof slots.url === 'string' ? slots.url.trim() : ''
    const stripped = normalised.replace(BROWSER_ACT_GOAL_OPEN_URL, '').trim()
    const url = fromSlot || stripped
    if (url) {
      await ScreenBrowserAct.openUrl(url, openBrowserModal)
      showBrowserToast(`Opened ${url} in browser.`, 'success')
    } else {
      showBrowserToast('Open URL in browser: no URL provided.', 'warning')
    }
  }
}
