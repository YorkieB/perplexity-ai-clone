/* Webview guest lifecycle nests callbacks under dom-ready. */
/* eslint-disable sonarjs/no-nested-functions */
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
  getWebContentsId?: () => number
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  loadURL: (url: string, options?: { userAgent?: string; httpReferrer?: string }) => void
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
  faviconUrl?: string
  isPinned?: boolean
}

interface WebviewRowProps {
  tab: BrowserTabModel
  active: boolean
  partition: string
  /** Absolute guest preload path (enables `__jarvisInspectorHost` in guest). */
  guestInspectorPreloadPath?: string
  onWebviewMount: (tabId: string, el: InAppWebview | null) => void
  onDidNavigate: (tabId: string, url: string) => void
  onPageTitle: (tabId: string, title: string) => void
  onFaviconUpdated?: (tabId: string, faviconUrl: string) => void
  onNewWindow: (url: string) => void
  onLoadingChange: (loading: boolean) => void
  onDidFailLoad?: (tabId: string, detail: { url: string; errorCode: number; description: string }) => void
}

function webpreferencesForGuest(preloadPath?: string): string {
  // transparent defaults to true for <webview> guests (electron.d.ts): background stays transparent and
  // can composite as solid black / wrong color over our host until remote paint — force opaque guest.
  const parts = [
    'contextIsolation=yes',
    'nodeIntegration=no',
    'sandbox=no',
    'transparent=no',
    'backgroundThrottling=no',
  ]
  const norm = preloadPath?.trim()
  if (norm) parts.push(`preload=${norm.replace(/\\/g, '/')}`)
  // sandbox=no avoids rare Windows compositor / guest paint issues with <webview>; guest still has no nodeIntegration.
  return parts.join(',')
}

function WebviewRow({
  tab,
  active,
  partition,
  guestInspectorPreloadPath,
  onWebviewMount,
  onDidNavigate,
  onPageTitle,
  onFaviconUpdated,
  onNewWindow,
  onLoadingChange,
  onDidFailLoad,
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

      const browserApi = window.electronInAppBrowser
      const getGuestId = (): number | null => {
        try {
          const id = w.getWebContentsId?.()
          return typeof id === 'number' ? id : null
        } catch {
          return null
        }
      }

      const setupInspectorBridge = () => {
        const guestId = getGuestId()
        if (guestId == null || !browserApi?.inspectorAfterGuestDomReady) return
        browserApi.inspectorAfterGuestDomReady(tab.id, guestId).catch(() => {})
      }

      setupInspectorBridge()

      const onIpcMessage = (ev: Event) => {
        const e = ev as unknown as { channel?: string; args?: unknown[] }
        if (e.channel !== 'jarvis-inspector' || !browserApi?.inspectorForwardGuestEvent) return
        const pack = e.args?.[0] as { type?: string; payload?: unknown } | undefined
        if (!pack || typeof pack.type !== 'string') return
        browserApi.inspectorForwardGuestEvent({
          tabId: tab.id,
          kind: pack.type,
          payload: pack.payload,
        })
      }
      w.addEventListener('ipc-message', onIpcMessage)

      const onNav = (ev: Event) => {
        try {
          const url = (ev as unknown as { url?: string }).url ?? w.getURL()
          if (url) onDidNavigate(tab.id, url)
        } catch {
          /* guest not ready */
        }
      }
      const onStart = () => onLoadingChange(true)
      const onStop = () => {
        onLoadingChange(false)
        const guestId = getGuestId()
        if (guestId != null && browserApi?.inspectorReinjectGuest) {
          browserApi.inspectorReinjectGuest(guestId).catch(() => {})
        }
      }
      const onTit = (ev: Event) => {
        const title = (ev as unknown as { title?: string }).title ?? ''
        onPageTitle(tab.id, title)
      }
      const onFav = (ev: Event) => {
        const favs = (ev as unknown as { favicons?: string[] }).favicons
        const fav = favs && favs[0]
        if (fav && onFaviconUpdated) onFaviconUpdated(tab.id, fav)
      }
      const onNew = (ev: Event) => {
        ev.preventDefault()
        const url = (ev as unknown as { url?: string }).url
        if (url) onNewWindow(url)
      }

      const onFailLoad = (ev: Event) => {
        if (!onDidFailLoad) return
        const e = ev as unknown as {
          errorCode: number
          errorDescription: string
          validatedURL: string
          isMainFrame: boolean
        }
        if (e.isMainFrame === false) return
        // ERR_ABORTED — navigation replaced or cancelled; not a user-visible failure.
        if (e.errorCode === -3) return
        onDidFailLoad(tab.id, {
          url: e.validatedURL,
          errorCode: e.errorCode,
          description: e.errorDescription,
        })
      }

      w.addEventListener('did-navigate', onNav)
      w.addEventListener('did-navigate-in-page', onNav)
      w.addEventListener('did-start-loading', onStart)
      w.addEventListener('did-stop-loading', onStop)
      w.addEventListener('page-title-updated', onTit)
      w.addEventListener('page-favicon-updated', onFav)
      w.addEventListener('new-window', onNew)
      w.addEventListener('did-fail-load', onFailLoad)

      removeNavListeners = () => {
        w.removeEventListener('ipc-message', onIpcMessage)
        w.removeEventListener('did-navigate', onNav)
        w.removeEventListener('did-navigate-in-page', onNav)
        w.removeEventListener('did-start-loading', onStart)
        w.removeEventListener('did-stop-loading', onStop)
        w.removeEventListener('page-title-updated', onTit)
        w.removeEventListener('page-favicon-updated', onFav)
        w.removeEventListener('new-window', onNew)
        w.removeEventListener('did-fail-load', onFailLoad)
      }
    })

    return () => {
      offReady()
      removeNavListeners?.()
      w.removeEventListener('crashed', onCrash)
      w.removeEventListener('did-fail-load', onFailLoad)
      window.electronInAppBrowser?.inspectorUnregisterTab?.(tab.id)?.catch(() => {})
      onWebviewMount(tab.id, null)
    }
  }, [tab.id, onWebviewMount, onDidNavigate, onPageTitle, onFaviconUpdated, onNewWindow, onLoadingChange, onDidFailLoad])

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden',
        // Avoid opacity on ancestors of <webview> — can break guest compositing on Windows (use visibility).
        active ? 'visible z-10' : 'invisible z-0 pointer-events-none'
      )}
      aria-hidden={!active}
    >
      {/* Electron webview — not a standard DOM element; eslint may flag unknown property.
          Do not use display:flex on the tag: guest surface may not size/paint (electron#3948). */}
      <webview
        ref={(el) => {
          ref.current = el as InAppWebview | null
        }}
        src={frozenSrc}
        partition={partition}
        allowpopups={true}
        webpreferences={webpreferencesForGuest(guestInspectorPreloadPath)}
        className="absolute inset-0 box-border h-full min-h-0 w-full border-0 bg-white dark:bg-zinc-950"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}

interface InAppBrowserWebviewAreaProps {
  partition: string
  tabs: BrowserTabModel[]
  activeTabId: string
  guestInspectorPreloadPath?: string
  onWebviewMount: (tabId: string, el: InAppWebview | null) => void
  onDidNavigate: (tabId: string, url: string) => void
  onPageTitle: (tabId: string, title: string) => void
  onFaviconUpdated?: (tabId: string, faviconUrl: string) => void
  onNewWindow: (url: string) => void
  onLoadingChange: (loading: boolean) => void
  onDidFailLoad?: (tabId: string, detail: { url: string; errorCode: number; description: string }) => void
}

/**
 * One `<webview>` per tab (hidden when inactive) so each tab keeps Chromium navigation history.
 */
export function InAppBrowserWebviewArea(props: InAppBrowserWebviewAreaProps) {
  const { tabs, activeTabId, onFaviconUpdated, guestInspectorPreloadPath, onDidFailLoad, ...rest } = props
  return (
    <div className="relative min-h-0 flex-1">
      {tabs.map((tab) => (
        <WebviewRow
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          guestInspectorPreloadPath={guestInspectorPreloadPath}
          onFaviconUpdated={onFaviconUpdated}
          onDidFailLoad={onDidFailLoad}
          {...rest}
        />
      ))}
    </div>
  )
}
