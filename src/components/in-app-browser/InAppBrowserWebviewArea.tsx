import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const DEBUG_BROWSER = typeof localStorage !== 'undefined' && localStorage.getItem('debug-browser') === '1'
function dbg(...args: unknown[]) {
  if (DEBUG_BROWSER) console.debug('[browser]', ...args)
}

/** Renderer-safe subset of Electron `<webview>` API */
export type InAppWebview = HTMLElement & {
  src: string
  partition: string
  /** False when idle; Electron requires dom-ready before most guest APIs. */
  isLoading?: () => boolean
  getURL: () => string
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  loadURL: (url: string) => void
  openDevTools: () => void
  setZoomFactor: (z: number) => number
  executeJavaScript: (code: string) => Promise<unknown>
  getWebContents: () => {
    findInPage: (text: string, opts?: { forward?: boolean; findNext?: boolean }) => number
    stopFindInPage: (action: 'clearSelection' | 'activateSelection' | 'keepSelection') => void
  }
}

/**
 * Run once the guest has attached and `dom-ready` has fired.
 * Do **not** use `isLoading() === false` as a shortcut — it can be false before `dom-ready`,
 * which triggers: "The WebView must be attached to the DOM and the dom-ready event..."
 */
function whenWebviewGuestReady(w: InAppWebview, onReady: () => void): () => void {
  let cancelled = false
  let finished = false

  const run = () => {
    if (cancelled || finished) return
    finished = true
    dbg('dom-ready fired, calling onReady')
    try {
      onReady()
    } catch (e) {
      dbg('onReady threw:', e)
      /* guest not ready — ignore */
    }
  }

  const onDomReady = () => run()
  w.addEventListener('dom-ready', onDomReady, { once: true })

  // Warn if dom-ready hasn't fired after 10 seconds
  const domReadyTimeout = setTimeout(() => {
    if (!finished && !cancelled) {
      console.warn('[browser] dom-ready has not fired after 10s — webview may be stuck. src:', w.src, 'partition:', w.partition)
    }
  }, 10_000)

  return () => {
    cancelled = true
    clearTimeout(domReadyTimeout)
    w.removeEventListener('dom-ready', onDomReady)
  }
}

export interface BrowserTabModel {
  id: string
  /** Only used for first paint of `<webview src>` — do not change after mount (use loadURL). */
  srcAtCreate: string
  url: string
  title: string
}

interface WebviewRowProps {
  tab: BrowserTabModel
  active: boolean
  partition: string
  expanded: boolean
  onWebviewMount: (tabId: string, el: InAppWebview | null) => void
  onDidNavigate: (tabId: string, url: string) => void
  onPageTitle: (tabId: string, title: string) => void
  onNewWindow: (url: string) => void
  onLoadingChange: (loading: boolean) => void
}

function WebviewRow({
  tab,
  active,
  partition,
  expanded,
  onWebviewMount,
  onDidNavigate,
  onPageTitle,
  onNewWindow,
  onLoadingChange,
}: WebviewRowProps) {
  const [frozenSrc] = useState(() => tab.srcAtCreate)
  const ref = useRef<InAppWebview | null>(null)

  /**
   * Electron throws if guest APIs/listeners run before the webview is in the DOM and
   * `dom-ready` has fired. Register the element + listeners only after guest is ready.
   * `useLayoutEffect` runs after the webview node is in the document (before paint).
   */
  useLayoutEffect(() => {
    const w = ref.current
    if (!w) return

    // Debug: monitor webview health events
    const onCrash = () => console.error(`[webview ${tab.id}] CRASHED`)
    const onFailLoad = (e: Event) => {
      const detail = e as unknown as { errorCode?: number; errorDescription?: string; validatedURL?: string }
      if (detail.errorCode === -3) return // ERR_ABORTED is harmless (navigation cancelled)
      console.error(`[webview ${tab.id}] did-fail-load:`, detail.errorCode, detail.errorDescription, detail.validatedURL)
    }
    w.addEventListener('crashed', onCrash)
    w.addEventListener('did-fail-load', onFailLoad)

    let removeNavListeners: (() => void) | undefined

    const offReady = whenWebviewGuestReady(w, () => {
      dbg(`webview ${tab.id} guest ready, registering`)
      onWebviewMount(tab.id, w)

      const onNav = (ev: Event) => {
        try {
          const url = (ev as unknown as { url?: string }).url ?? w.getURL()
          if (url) onDidNavigate(tab.id, url)
        } catch {
          /* guest not ready */
        }
      }
      const onStart = () => onLoadingChange(true)
      const onStop = () => onLoadingChange(false)
      const onTit = (ev: Event) => {
        const title = (ev as unknown as { title?: string }).title ?? ''
        onPageTitle(tab.id, title)
      }
      const onNew = (ev: Event) => {
        ev.preventDefault()
        const url = (ev as unknown as { url?: string }).url
        if (url) onNewWindow(url)
      }

      w.addEventListener('did-navigate', onNav)
      w.addEventListener('did-navigate-in-page', onNav)
      w.addEventListener('did-start-loading', onStart)
      w.addEventListener('did-stop-loading', onStop)
      w.addEventListener('page-title-updated', onTit)
      w.addEventListener('new-window', onNew)

      removeNavListeners = () => {
        w.removeEventListener('did-navigate', onNav)
        w.removeEventListener('did-navigate-in-page', onNav)
        w.removeEventListener('did-start-loading', onStart)
        w.removeEventListener('did-stop-loading', onStop)
        w.removeEventListener('page-title-updated', onTit)
        w.removeEventListener('new-window', onNew)
      }
    })

    return () => {
      offReady()
      removeNavListeners?.()
      w.removeEventListener('crashed', onCrash)
      w.removeEventListener('did-fail-load', onFailLoad)
      onWebviewMount(tab.id, null)
    }
  }, [tab.id, onWebviewMount, onDidNavigate, onPageTitle, onNewWindow, onLoadingChange])

  return (
    <div
      className={cn(
        'absolute inset-0 flex min-h-0 flex-col overflow-hidden',
        active ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
      )}
      aria-hidden={!active}
    >
      {/* Electron webview — not a standard DOM element; eslint may flag unknown property */}
      <webview
        ref={(el) => {
          ref.current = el as InAppWebview | null
        }}
        src={frozenSrc}
        partition={partition}
        allowpopups={true}
        className={
          expanded
            ? 'h-full min-h-0 w-full flex-1 border-0 bg-white dark:bg-zinc-950'
            : 'h-[min(520px,60vh)] w-full border-0 bg-white dark:bg-zinc-950'
        }
        style={{ display: 'flex', flex: 1, minHeight: 0 }}
      />
    </div>
  )
}

interface InAppBrowserWebviewAreaProps {
  partition: string
  tabs: BrowserTabModel[]
  activeTabId: string
  expanded: boolean
  onWebviewMount: (tabId: string, el: InAppWebview | null) => void
  onDidNavigate: (tabId: string, url: string) => void
  onPageTitle: (tabId: string, title: string) => void
  onNewWindow: (url: string) => void
  onLoadingChange: (loading: boolean) => void
}

/**
 * One `<webview>` per tab (hidden when inactive) so each tab keeps Chromium navigation history.
 */
export function InAppBrowserWebviewArea(props: InAppBrowserWebviewAreaProps) {
  const { tabs, activeTabId, ...rest } = props
  return (
    <div className="relative min-h-0 flex-1">
      {tabs.map((tab) => (
        <WebviewRow
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          {...rest}
        />
      ))}
    </div>
  )
}
