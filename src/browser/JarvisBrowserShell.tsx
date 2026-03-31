/* Tab + webview orchestration: complexity is split across stores; nested callbacks wrap Electron guest APIs. */
/* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-nested-functions */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowsInSimple,
  ArrowsOutSimple,
  Minus,
  ArrowsOutCardinal,
  MagnifyingGlass,
  BookmarkSimple,
  ClockCounterClockwise,
  Code,
  Plus,
  X,
  DownloadSimple,
  House,
  Gear,
  List,
  PuzzlePiece,
  TreeStructure,
} from '@phosphor-icons/react'
import { ExternalLink, X as LucideX } from 'lucide-react'
import { randomIdSegment } from '@/lib/secure-random'
import { cn } from '@/lib/utils'
import {
  isElectronDesktop,
  isElectronWebviewAvailable,
  syncBrowserSettingsToMain,
} from '@/browser/electron-browser-bridge'
import { resolveOmniboxInput, normalizeNavigationUrl, resolvedLiveWebHomepage } from '@/browser/omnibox'
import { proxyUrlForIframe, isProxiedUrl, extractOriginalUrl } from '@/browser/iframe-proxy'
import { isEmbeddableBrowserNavigationUrl } from '@/browser/embed-url-guard'
import { MAX_TABS } from '@/browser/constants'

/**
 * Guest loads use Chromium directly in the partition session — no app REST API or WebSocket is involved
 * in fetching the page. A desktop Chrome UA avoids some sites treating Electron as a bot.
 */
const JARVIS_WEBVIEW_LOAD_OPTS = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
} as const
import type { Bookmark, BrowserTab, BrowserSettings, DownloadItem } from '@/browser/types'
import { loadBrowserSettings, saveBrowserSettings } from '@/browser/stores/settings-store'
import { loadBrowserSession, saveBrowserSession, sessionFromRuntimeState } from '@/browser/stores/session-store'
import { loadBookmarks, removeBookmark, addBookmark } from '@/browser/stores/bookmarks-store'
import { mapIpcStatus, upsertDownloadItem } from '@/browser/stores/downloads-store'
import { loadHistory, recordHistoryVisit } from '@/browser/stores/history-store'
import {
  InAppBrowserWebviewArea,
  type BrowserTabModel,
  type InAppWebview,
} from '@/components/in-app-browser/InAppBrowserWebviewArea'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  useBrowserControlRegister,
  useBrowserGuideMode,
  useBrowserAutomating,
  useBrowserAgentSteps,
  type BrowserControl,
} from '@/contexts/BrowserControlContext'
import {
  SNAPSHOT_SCRIPT,
  EXTRACT_SCRIPT,
  clickScript,
  typeScript,
  scrollScript,
  refRectScript,
} from '@/lib/browser-agent-scripts'
import { GuidanceHighlight } from '@/components/GuidanceHighlight'
import { registerJarvisBrowserImpl, type JarvisBrowserImpl } from '@/browser/jarvis-browser-runtime'
import {
  NewTabPage,
  BookmarksManagerPanel,
  HistoryManagerPanel,
  DownloadsManagerPanel,
  SettingsManagerPanel,
} from '@/browser/panels/BrowserManagerPanels'
import { DevToolsDomInspectorPanel } from '@/browser/panels/DevToolsDomInspectorPanel'
import type { InspectorAiRequest } from '@/browser/types-layout'
import { ToastHost } from '@/ui/toast/ToastHost'

const LAST_URL_KEY = 'web-browser-modal-last-url'

export interface RuntimeTab {
  id: string
  srcAtCreate: string
  url: string
  title: string
  faviconUrl?: string
  isPinned: boolean
  createdAt: number
  lastActiveAt: number
}

function generateTabId(): string {
  return `t_${Date.now()}_${randomIdSegment()}`
}

function tabTitleForUrl(u: string): string {
  if (u === 'about:blank') return 'New tab'
  if (u.includes('bing.com')) return 'Bing'
  return u
}

function toModels(tabs: RuntimeTab[]): BrowserTabModel[] {
  return tabs.map((t) => ({
    id: t.id,
    srcAtCreate: t.srcAtCreate,
    url: t.url,
    title: t.title,
    faviconUrl: t.faviconUrl,
    isPinned: t.isPinned,
  }))
}

function runtimeTabFromSession(t: BrowserTab, srcAtCreate: string): RuntimeTab {
  return {
    id: t.id,
    srcAtCreate,
    url: t.url,
    title: t.title,
    faviconUrl: t.faviconUrl,
    isPinned: t.isPinned,
    createdAt: t.createdAt,
    lastActiveAt: t.lastActiveAt,
  }
}

export interface JarvisBrowserShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestOpen?: () => void
  /** Route DOM inspector “Explain / Fix” into IDE chat (open code editor + send turn). */
  onInspectorAiRequest?: (request: InspectorAiRequest) => void
}

type ChromePanel = 'main' | 'bookmarks' | 'history' | 'downloads' | 'settings' | 'inspector'

export function JarvisBrowserShell({
  open,
  onOpenChange,
  onRequestOpen,
  onInspectorAiRequest,
}: JarvisBrowserShellProps) {
  const useWebview = isElectronWebviewAvailable()
  const partition = window.electronInAppBrowser?.webviewPartition ?? ''
  const { register, unregister } = useBrowserControlRegister()
  const { guideMode, setGuideMode } = useBrowserGuideMode()
  const { automating } = useBrowserAutomating()
  const { agentSteps } = useBrowserAgentSteps()
  const [stepsExpanded, setStepsExpanded] = useState(false)
  /** Guide mode: element rect in window coordinates for {@link GuidanceHighlight}. */
  const [guideHighlight, setGuideHighlight] = useState<{
    x: number
    y: number
    width: number
    height: number
    label?: string
  } | null>(null)

  const [settings, setSettings] = useState<BrowserSettings>(() => loadBrowserSettings())
  const [chromePanel, setChromePanel] = useState<ChromePanel>('main')
  const [panelRev, setPanelRev] = useState(0)

  const [input, setInput] = useState('')
  const [nav, setNav] = useState<{ stack: string[]; index: number }>(() => {
    const startUrl = resolvedLiveWebHomepage(loadBrowserSettings())
    return { stack: [startUrl], index: 0 }
  })
  const [expanded, setExpanded] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [tabs, setTabs] = useState<RuntimeTab[]>(() => {
    const now = Date.now()
    const id = generateTabId()
    const startUrl = resolvedLiveWebHomepage(loadBrowserSettings())
    return [
      {
        id,
        srcAtCreate: startUrl,
        url: startUrl,
        title: tabTitleForUrl(startUrl),
        isPinned: false,
        createdAt: now,
        lastActiveAt: now,
      },
    ]
  })
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? '')
  const webviews = useRef<Map<string, InAppWebview>>(new Map())
  /** If the user navigates before dom-ready, `loadURL` must run after {@link onWebviewMount}. */
  const pendingNavigationByTabRef = useRef<Map<string, string>>(new Map())
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [loading, setLoading] = useState(false)
  const [navTick, setNavTick] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [zoomLabel, setZoomLabel] = useState('100%')
  const [webviewShellReady, setWebviewShellReady] = useState(false)
  const [, setListRev] = useState(0)
  const [activeDownloads, setActiveDownloads] = useState<DownloadItem[]>([])
  const [guestInspectorPreloadPath, setGuestInspectorPreloadPath] = useState('')
  /** Hides the new-tab overlay as soon as the user commits a URL (before React applies tab url). */
  const [newTabOverlayDismissed, setNewTabOverlayDismissed] = useState(false)

  const sortedTabs = useMemo(() => {
    const pinned = tabs.filter((t) => t.isPinned)
    const rest = tabs.filter((t) => !t.isPinned)
    return [...pinned, ...rest]
  }, [tabs])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId])
  const src = useMemo(() => nav.stack[nav.index] ?? 'about:blank', [nav.stack, nav.index])

  const bookmarks = loadBookmarks()
  const history = loadHistory()

  const activeWebview = webviews.current.get(activeTabId)
  const showNewTabOverlay =
    useWebview &&
    chromePanel === 'main' &&
    activeTab?.url === 'about:blank' &&
    !newTabOverlayDismissed

  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab?.url === 'about:blank') {
      setNewTabOverlayDismissed(false)
    }
  }, [activeTabId, tabs])

  const canBack = useMemo(() => {
    if (navTick < 0) return false
    if (!useWebview) return nav.index > 0
    const w = webviews.current.get(activeTabId)
    if (!w) return false
    try {
      return w.canGoBack()
    } catch {
      return false
    }
  }, [useWebview, activeTabId, nav.index, navTick])

  const canForward = useMemo(() => {
    if (navTick < 0) return false
    if (!useWebview) return nav.index < nav.stack.length - 1
    const w = webviews.current.get(activeTabId)
    if (!w) return false
    try {
      return w.canGoForward()
    } catch {
      return false
    }
  }, [useWebview, activeTabId, nav.index, nav.stack.length, navTick])

  const persistSessionSoon = useCallback(() => {
    const t = tabsRef.current
    const aid = activeTabIdRef.current
    saveBrowserSession(sessionFromRuntimeState(t, aid))
  }, [])

  useEffect(() => {
    if (!open || !useWebview) return
    const h = window.setTimeout(persistSessionSoon, 450)
    return () => clearTimeout(h)
  }, [tabs, activeTabId, open, useWebview, persistSessionSoon])

  useEffect(() => {
    void syncBrowserSettingsToMain()
  }, [settings, open])

  useEffect(() => {
    if (!useWebview || !window.electronInAppBrowser?.onDownloadProgress) return
    const off = window.electronInAppBrowser.onDownloadProgress((p) => {
      const now = Date.now()
      const item: DownloadItem = {
        id: p.id,
        url: p.url,
        fileName: p.fileName,
        status: mapIpcStatus(p.status),
        bytesReceived: p.bytesReceived,
        totalBytes: p.totalBytes,
        startedAt: now,
        localPath: p.path || undefined,
      }
      const next = upsertDownloadItem(item)
      setActiveDownloads(next.filter((d) => d.status === 'in_progress'))
    })
    return off
  }, [useWebview])

  useEffect(() => {
    if (!useWebview || !window.electronInAppBrowser) return
    const off = window.electronInAppBrowser.onDownloadComplete((p) => {
      toast.success(`Downloaded: ${p.filename}`, { description: p.path })
      if (p.id) {
        upsertDownloadItem({
          id: p.id,
          url: '',
          fileName: p.filename,
          status: 'completed',
          bytesReceived: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          localPath: p.path,
        })
      }
      setActiveDownloads((d) => d.filter((x) => x.status === 'in_progress'))
    })
    return off
  }, [useWebview])

  const pushUrlIframe = useCallback((raw: string) => {
    const u = normalizeNavigationUrl(raw)
    setNav((prev) => {
      if (prev.stack[prev.index] === u) return prev
      const stack = prev.stack.slice(0, prev.index + 1)
      stack.push(u)
      return { stack, index: stack.length - 1 }
    })
    recordHistoryVisit(u, u)
    try {
      if (u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u)
    } catch {
      /* ignore */
    }
  }, [])

  const onWebviewMount = useCallback((tabId: string, el: InAppWebview | null) => {
    if (el) {
      webviews.current.set(tabId, el)
      const pending = pendingNavigationByTabRef.current.get(tabId)
      if (pending) {
        pendingNavigationByTabRef.current.delete(tabId)
        try {
          el.loadURL(pending, JARVIS_WEBVIEW_LOAD_OPTS)
        } catch {
          toast.error('Web view could not load that page. Try again.')
        }
      }
    } else {
      webviews.current.delete(tabId)
    }
    setNavTick((n) => n + 1)
  }, [])

  const onDidNavigate = useCallback(
    (tabId: string, url: string) => {
      const u = url || ''
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, url: u || t.url, lastActiveAt: Date.now() } : t
        )
      )
      if (tabId === activeTabId) {
        setInput(u === 'about:blank' ? '' : u)
      }
      recordHistoryVisit(u, u)
      setListRev((r) => r + 1)
      setNavTick((n) => n + 1)
      try {
        if (u && u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u)
      } catch {
        /* ignore */
      }
    },
    [activeTabId]
  )

  const onPageTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: title || t.title } : t)))
  }, [])

  const onFaviconUpdated = useCallback((tabId: string, faviconUrl: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, faviconUrl } : t)))
  }, [])

  const onNewWindow = useCallback(
    (url: string) => {
      const u = normalizeNavigationUrl(url)
      if (tabsRef.current.length >= MAX_TABS) {
        toast.warning('Tab limit reached')
        return
      }
      const id = generateTabId()
      const now = Date.now()
      setTabs((prev) => [...prev, { id, srcAtCreate: u, url: u, title: u, isPinned: false, createdAt: now, lastActiveAt: now }])
      setActiveTabId(id)
    },
    []
  )

  const onDidFailLoad = useCallback(
    (_tabId: string, detail: { url: string; errorCode: number; description: string }) => {
      toast.error('Page failed to load', {
        description: [detail.description, detail.url].filter(Boolean).join(' — '),
      })
    },
    []
  )

  useEffect(() => {
    if (!open) {
      setMinimized(false)
      setGuideHighlight(null)
    }
  }, [open])

  useEffect(() => {
    if (open && !minimized) setExpanded(true)
  }, [open, minimized])

  useLayoutEffect(() => {
    if (!open) {
      setWebviewShellReady(false)
      return
    }
    const s = loadBrowserSettings()
    setSettings(s)
    void syncBrowserSettingsToMain()

    if (useWebview) {
      let cancelled = false
      void (async () => {
        let preloadPath = ''
        try {
          const r = await window.electronInAppBrowser?.getWebviewGuestPreloadPath?.()
          preloadPath = typeof r === 'string' ? r : ''
        } catch {
          /* ignore */
        }
        if (cancelled) return
        setGuestInspectorPreloadPath(preloadPath)

        try {
          if (s.openOnStartup === 'last_session') {
            const sess = loadBrowserSession()
            if (sess && sess.tabs.length > 0) {
              const homeUrl = resolvedLiveWebHomepage(s)
              const restored = sess.tabs.slice(0, MAX_TABS).map((t) =>
                runtimeTabFromSession(
                  { ...t, isActive: false },
                  t.url === 'about:blank' ? homeUrl : t.url
                )
              )
              const aid = sess.activeTabId && restored.some((x) => x.id === sess.activeTabId)
                ? sess.activeTabId
                : restored[0].id
              if (!cancelled) {
                setTabs(restored)
                setActiveTabId(aid)
                const cur = restored.find((x) => x.id === aid)
                setInput(cur?.url === 'about:blank' ? '' : cur?.url ?? '')
                setWebviewShellReady(true)
              }
              return
            }
          }
          const last = localStorage.getItem(LAST_URL_KEY)?.trim()
          const homeUrl = resolvedLiveWebHomepage(s)
          const u = last ? normalizeNavigationUrl(last) : homeUrl
          const id = generateTabId()
          const now = Date.now()
          if (!cancelled) {
            setTabs([
              {
                id,
                srcAtCreate: u,
                url: u,
                title: tabTitleForUrl(u),
                isPinned: false,
                createdAt: now,
                lastActiveAt: now,
              },
            ])
            setActiveTabId(id)
            setInput(u === 'about:blank' ? '' : u)
            setWebviewShellReady(true)
          }
        } catch {
          if (cancelled) return
          const id = generateTabId()
          const now = Date.now()
          const fallbackUrl = resolvedLiveWebHomepage(loadBrowserSettings())
          setTabs([
            {
              id,
              srcAtCreate: fallbackUrl,
              url: fallbackUrl,
              title: tabTitleForUrl(fallbackUrl),
              isPinned: false,
              createdAt: now,
              lastActiveAt: now,
            },
          ])
          setActiveTabId(id)
          setInput('')
          setWebviewShellReady(true)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    try {
      setWebviewShellReady(false)
      const last = localStorage.getItem(LAST_URL_KEY)?.trim()
      const homeUrl = resolvedLiveWebHomepage(loadBrowserSettings())
      const u = last ? normalizeNavigationUrl(last) : homeUrl
      setNav({ stack: [u], index: 0 })
    } catch {
      setNav({ stack: [resolvedLiveWebHomepage(loadBrowserSettings())], index: 0 })
    }
  }, [open, useWebview])

  useEffect(() => {
    if (useWebview) return
    const u = nav.stack[nav.index] ?? 'about:blank'
    setInput(u === 'about:blank' ? '' : u)
  }, [nav.stack, nav.index, useWebview])

  useEffect(() => {
    if (useWebview || !isElectronDesktop()) return
    const api = window.electronInAppBrowser
    if (!api?.onIframeNavigated) return
    const off = api.onIframeNavigated((url) => {
      if (!url || url === 'about:blank') return
      if (!isEmbeddableBrowserNavigationUrl(url)) return
      pushUrlIframe(url)
    })
    return off
  }, [useWebview, pushUrlIframe])

  const navigateActive = useCallback(
    (raw: string) => {
      const target = resolveOmniboxInput(raw, settingsRef.current)
      if (useWebview) {
        if (target !== 'about:blank') {
          setNewTabOverlayDismissed(true)
        }
        const tabId = activeTabIdRef.current
        const w = webviews.current.get(tabId)
        if (w) {
          try {
            w.loadURL(target, JARVIS_WEBVIEW_LOAD_OPTS)
          } catch {
            toast.error('Web view is not ready yet. Try again in a moment.')
            return
          }
          pendingNavigationByTabRef.current.delete(tabId)
        } else {
          pendingNavigationByTabRef.current.set(tabId, target)
        }
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, url: target, lastActiveAt: Date.now() } : t
          )
        )
        try {
          if (target !== 'about:blank') localStorage.setItem(LAST_URL_KEY, target)
        } catch {
          /* ignore */
        }
      } else {
        pushUrlIframe(raw)
      }
    },
    [useWebview, pushUrlIframe]
  )

  const goHome = useCallback(() => {
    navigateActive(resolvedLiveWebHomepage(settingsRef.current))
  }, [navigateActive])

  useEffect(() => {
    if (!useWebview) return

    function getActiveWv(): InAppWebview | null {
      return webviews.current.get(activeTabIdRef.current) ?? null
    }

    const control: BrowserControl = {
      navigate: (url: string) =>
        new Promise((resolve) => {
          const w = getActiveWv()
          if (!w) {
            resolve({ ok: false, url: '', title: '' })
            return
          }
          const u = normalizeNavigationUrl(url)
          let settled = false
          const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            w.removeEventListener('did-stop-loading', onStop)
            let finalUrl = u
            try {
              finalUrl = w.getURL()
            } catch {
              /* */
            }
            resolve({ ok: true, url: finalUrl, title: '' })
          }, 15000)
          const onStop = () => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            w.removeEventListener('did-stop-loading', onStop)
            let finalUrl = u
            try {
              finalUrl = w.getURL()
            } catch {
              /* ignore */
            }
            const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current)
            resolve({ ok: true, url: finalUrl, title: tab?.title ?? '' })
          }
          w.addEventListener('did-stop-loading', onStop)
          try {
            w.loadURL(u, JARVIS_WEBVIEW_LOAD_OPTS)
            try {
              if (u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u)
            } catch {
              /* */
            }
          } catch {
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              w.removeEventListener('did-stop-loading', onStop)
              resolve({ ok: false, url: '', title: '' })
            }
          }
        }),

      snapshot: async () => {
        const w = getActiveWv()
        if (!w) return 'Browser is not open or webview not ready.'
        try {
          return (await w.executeJavaScript(SNAPSHOT_SCRIPT)) as string
        } catch (e) {
          return `Snapshot error: ${e instanceof Error ? e.message : String(e)}`
        }
      },

      click: async (ref: string) => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try {
          return (await w.executeJavaScript(clickScript(ref))) as { ok: boolean }
        } catch {
          return { ok: false }
        }
      },

      type: async (ref: string, text: string) => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try {
          return (await w.executeJavaScript(typeScript(ref, text))) as { ok: boolean }
        } catch {
          return { ok: false }
        }
      },

      extractText: async () => {
        const w = getActiveWv()
        if (!w) return ''
        try {
          return (await w.executeJavaScript(EXTRACT_SCRIPT)) as string
        } catch {
          return ''
        }
      },

      scroll: async (direction: 'up' | 'down') => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try {
          return (await w.executeJavaScript(scrollScript(direction))) as { ok: boolean }
        } catch {
          return { ok: false }
        }
      },

      goBack: async () => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try {
          w.goBack()
          return { ok: true }
        } catch {
          return { ok: false }
        }
      },

      goForward: async () => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try {
          w.goForward()
          return { ok: true }
        } catch {
          return { ok: false }
        }
      },

      getCurrentUrl: () => {
        const w = getActiveWv()
        if (!w) return 'about:blank'
        try {
          return w.getURL()
        } catch {
          return 'about:blank'
        }
      },

      isOpen: () => open,
      openBrowser: () => {
        onRequestOpen?.()
      },

      newTab: (url?: string) =>
        new Promise((resolve) => {
          const currentTabs = tabsRef.current
          if (currentTabs.length >= MAX_TABS) {
            resolve({ ok: false, tabId: '' })
            return
          }
          const id = generateTabId()
          const u = url ? normalizeNavigationUrl(url) : 'about:blank'
          const now = Date.now()
          setTabs((prev) => [
            ...prev,
            {
              id,
              srcAtCreate: u,
              url: u,
              title: u === 'about:blank' ? 'New tab' : u,
              isPinned: false,
              createdAt: now,
              lastActiveAt: now,
            },
          ])
          setActiveTabId(id)
          setInput(u === 'about:blank' ? '' : u)
          resolve({ ok: true, tabId: id })
        }),

      switchTab: (tabId: string) =>
        new Promise((resolve) => {
          const tab = tabsRef.current.find((t) => t.id === tabId)
          if (!tab) {
            resolve({ ok: false })
            return
          }
          setActiveTabId(tabId)
          setInput(tab.url === 'about:blank' ? '' : tab.url)
          resolve({ ok: true })
        }),

      closeTab: (tabId: string) =>
        new Promise((resolve) => {
          const currentTabs = tabsRef.current
          if (currentTabs.length <= 1) {
            resolve({ ok: false })
            return
          }
          const idx = currentTabs.findIndex((t) => t.id === tabId)
          if (idx < 0) {
            resolve({ ok: false })
            return
          }
          webviews.current.delete(tabId)
          const remaining = currentTabs.filter((t) => t.id !== tabId)
          setTabs(remaining)
          if (activeTabIdRef.current === tabId) {
            const next = remaining[Math.min(idx, remaining.length - 1)]
            setActiveTabId(next.id)
            setInput(next.url === 'about:blank' ? '' : next.url)
          }
          resolve({ ok: true })
        }),

      listTabs: () =>
        tabsRef.current.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          active: t.id === activeTabIdRef.current,
        })),

      highlightRef: async (ref: string | null, label?: string) => {
        if (!ref) {
          setGuideHighlight(null)
          return
        }
        const w = getActiveWv()
        if (!w) {
          setGuideHighlight(null)
          return
        }
        try {
          const guest = (await w.executeJavaScript(refRectScript(ref))) as {
            ok: boolean
            x?: number
            y?: number
            width?: number
            height?: number
          }
          if (
            !guest.ok ||
            guest.x === undefined ||
            guest.y === undefined ||
            guest.width === undefined ||
            guest.height === undefined
          ) {
            setGuideHighlight(null)
            return
          }
          const hostRect = w.getBoundingClientRect()
          const minSize = 8
          const wdt = Math.max(guest.width, minSize)
          const hgt = Math.max(guest.height, minSize)
          setGuideHighlight({
            x: hostRect.left + guest.x,
            y: hostRect.top + guest.y,
            width: wdt,
            height: hgt,
            label,
          })
        } catch {
          setGuideHighlight(null)
        }
      },
    }

    register(control)
    return () => {
      unregister()
    }
  }, [useWebview, open, register, unregister, onRequestOpen])

  const toBrowserTab = useCallback(
    (t: RuntimeTab, isActive: boolean): BrowserTab => ({
      id: t.id,
      url: t.url,
      title: t.title,
      faviconUrl: t.faviconUrl,
      isActive,
      isPinned: t.isPinned,
      createdAt: t.createdAt,
      lastActiveAt: t.lastActiveAt,
    }),
    []
  )

  useEffect(() => {
    if (!open) {
      registerJarvisBrowserImpl(null)
      return
    }

    const impl: JarvisBrowserImpl = {
      openUrl: async (url, opts) => {
        const u = normalizeNavigationUrl(url)
        if (opts?.inNewTab) {
          if (tabsRef.current.length >= MAX_TABS) return
          const id = generateTabId()
          const now = Date.now()
          setTabs((prev) => [
            ...prev,
            { id, srcAtCreate: u, url: u, title: u, isPinned: false, createdAt: now, lastActiveAt: now },
          ])
          setActiveTabId(id)
          return
        }
        navigateActive(u)
      },
      openNewTab: async (url?: string) => {
        if (tabsRef.current.length >= MAX_TABS) {
          throw new Error('Tab limit reached')
        }
        const id = generateTabId()
        const u = url ? normalizeNavigationUrl(url) : 'about:blank'
        const now = Date.now()
        const tab: RuntimeTab = {
          id,
          srcAtCreate: u,
          url: u,
          title: u === 'about:blank' ? 'New tab' : u,
          isPinned: false,
          createdAt: now,
          lastActiveAt: now,
        }
        setTabs((prev) => [...prev, tab])
        setActiveTabId(id)
        return toBrowserTab(tab, true)
      },
      closeTab: async (tabId: string) => {
        const currentTabs = tabsRef.current
        if (currentTabs.length <= 1) return
        const idx = currentTabs.findIndex((t) => t.id === tabId)
        if (idx < 0) return
        webviews.current.delete(tabId)
        const remaining = currentTabs.filter((t) => t.id !== tabId)
        setTabs(remaining)
        if (activeTabIdRef.current === tabId) {
          const next = remaining[Math.min(idx, remaining.length - 1)]
          setActiveTabId(next.id)
          setInput(next.url === 'about:blank' ? '' : next.url)
        }
      },
      getCurrentSession: async () => {
        const aid = activeTabIdRef.current
        return sessionFromRuntimeState(tabsRef.current, aid)
      },
      getActiveTab: async () => {
        const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current)
        return t ? toBrowserTab(t, true) : null
      },
    }

    registerJarvisBrowserImpl(impl)
    return () => registerJarvisBrowserImpl(null)
  }, [open, navigateActive, toBrowserTab])

  const go = () => {
    const raw = input.trim()
    navigateActive(raw ? raw : resolvedLiveWebHomepage(settingsRef.current))
  }

  const back = () => {
    if (useWebview) {
      try {
        activeWebview?.goBack()
      } catch {
        /* guest not ready */
      }
      setNavTick((n) => n + 1)
    } else {
      setNav((prev) => {
        if (prev.index <= 0) return prev
        return { stack: prev.stack, index: prev.index - 1 }
      })
    }
  }

  const forward = () => {
    if (useWebview) {
      try {
        activeWebview?.goForward()
      } catch {
        /* guest not ready */
      }
      setNavTick((n) => n + 1)
    } else {
      setNav((prev) => {
        if (prev.index >= prev.stack.length - 1) return prev
        return { stack: prev.stack, index: prev.index + 1 }
      })
    }
  }

  const reload = () => {
    if (useWebview) {
      try {
        activeWebview?.reload()
      } catch {
        /* guest not ready */
      }
    } else {
      setReloadNonce((n) => n + 1)
    }
  }

  const stopLoad = () => {
    if (!useWebview) return
    try {
      activeWebview?.stop()
    } catch {
      /* guest not ready */
    }
  }

  const openExternal = () => {
    const u = useWebview ? activeTab?.url : src
    if (u && u !== 'about:blank') window.open(u, '_blank', 'noopener,noreferrer')
  }

  const addTab = () => {
    if (tabs.length >= MAX_TABS) {
      toast.warning('Maximum number of tabs reached')
      return
    }
    const id = generateTabId()
    const now = Date.now()
    const startUrl = resolvedLiveWebHomepage(loadBrowserSettings())
    setTabs((prev) => [
      ...prev,
      {
        id,
        srcAtCreate: startUrl,
        url: startUrl,
        title: tabTitleForUrl(startUrl),
        isPinned: false,
        createdAt: now,
        lastActiveAt: now,
      },
    ])
    setActiveTabId(id)
    setInput(startUrl)
    setChromePanel('main')
  }

  const closeTabById = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0 || tabs.length <= 1) return
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    webviews.current.delete(id)
    pendingNavigationByTabRef.current.delete(id)
    if (id === activeTabId) {
      const newActive = next[Math.max(0, idx - 1)] ?? next[0]
      setActiveTabId(newActive.id)
      setInput(newActive.url === 'about:blank' ? '' : newActive.url)
    }
  }

  const pinTab = (id: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t)))
  }

  const closeOthers = (id: string) => {
    tabs.forEach((t) => {
      if (t.id !== id) {
        webviews.current.delete(t.id)
        pendingNavigationByTabRef.current.delete(t.id)
      }
    })
    setTabs((prev) => prev.filter((t) => t.id === id))
    setActiveTabId(id)
  }

  const closeToTheRight = (id: string) => {
    const order = sortedTabs.map((t) => t.id)
    const i = order.indexOf(id)
    if (i < 0) return
    const toClose = new Set(order.slice(i + 1))
    setTabs((prev) => prev.filter((t) => !toClose.has(t.id)))
    toClose.forEach((tid) => {
      webviews.current.delete(tid)
      pendingNavigationByTabRef.current.delete(tid)
    })
  }

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      persistSessionSoon()
      onOpenChange(false)
    }
  }

  const minimize = () => {
    setExpanded(false)
    setMinimized(true)
  }

  const restoreFromMinimized = () => {
    setMinimized(false)
  }

  const dismissMinimized = () => {
    setMinimized(false)
    onOpenChange(false)
  }

  const rawBrowserUrl = useWebview ? activeTab?.url : src
  const minimizedLabel =
    rawBrowserUrl && rawBrowserUrl !== 'about:blank'
      ? (() => {
          const s0 = String(rawBrowserUrl).replace(/^https?:\/\//i, '')
          return s0.length > 44 ? `${s0.slice(0, 44)}…` : s0
        })()
      : 'Web browser'

  const iframeClassName = expanded
    ? 'h-full min-h-0 w-full flex-1 border-0 bg-white dark:bg-zinc-950'
    : 'h-[min(520px,60vh)] w-full border-0 bg-white dark:bg-zinc-950'

  let embeddedBrowserMain: ReactNode
  if (useWebview) {
    if (webviewShellReady) {
      embeddedBrowserMain = (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {settings.showBookmarksBar && chromePanel === 'main' && bookmarks.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-muted/20 px-2 py-1">
              {bookmarks.slice(0, 24).map((b: Bookmark) => (
                <Button
                  key={b.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 max-w-[140px] truncate px-2 text-xs"
                  title={b.url}
                  onClick={() => navigateActive(b.url)}
                >
                  {b.title}
                </Button>
              ))}
            </div>
          )}
          {activeDownloads.length > 0 && chromePanel === 'main' && (
            <div className="text-muted-foreground shrink-0 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
              Downloading{' '}
              {activeDownloads.map((d) => (
                <span key={d.id} className="mr-3 font-mono">
                  {d.fileName}
                  {d.totalBytes
                    ? ` (${Math.round((100 * d.bytesReceived) / d.totalBytes)}%)`
                    : ''}
                </span>
              ))}
            </div>
          )}
          <div
            className={cn(
              'relative min-h-0 flex-1',
              chromePanel !== 'main' && 'pointer-events-none invisible absolute inset-0'
            )}
          >
            {showNewTabOverlay && (
              <div className="absolute inset-0 z-[15] flex min-h-0 flex-col overflow-auto bg-background">
                <NewTabPage settings={settings} onNavigate={(u) => navigateActive(u)} />
              </div>
            )}
            <InAppBrowserWebviewArea
              partition={partition}
              tabs={toModels(tabs)}
              activeTabId={activeTabId}
              guestInspectorPreloadPath={guestInspectorPreloadPath || undefined}
              onWebviewMount={onWebviewMount}
              onDidNavigate={onDidNavigate}
              onPageTitle={onPageTitle}
              onFaviconUpdated={onFaviconUpdated}
              onNewWindow={onNewWindow}
              onLoadingChange={setLoading}
              onDidFailLoad={onDidFailLoad}
            />
          </div>
          {chromePanel !== 'main' && (
            <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-background">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setChromePanel('main')}>
                  ← Back to browser
                </Button>
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {chromePanel === 'bookmarks' && 'Bookmarks'}
                  {chromePanel === 'history' && 'History'}
                  {chromePanel === 'downloads' && 'Downloads'}
                  {chromePanel === 'settings' && 'Settings'}
                  {chromePanel === 'inspector' && 'DOM inspector'}
                </span>
                <span className="w-20" />
              </div>
              <div className="min-h-0 flex-1">
                {chromePanel === 'bookmarks' && (
                  <BookmarksManagerPanel
                    key={panelRev}
                    onOpenUrl={(u) => {
                      navigateActive(u)
                      setChromePanel('main')
                    }}
                    onChanged={() => setPanelRev((r) => r + 1)}
                  />
                )}
                {chromePanel === 'history' && (
                  <HistoryManagerPanel
                    key={panelRev}
                    onOpenUrl={(u) => {
                      navigateActive(u)
                      setChromePanel('main')
                    }}
                    onChanged={() => {
                      setPanelRev((r) => r + 1)
                      setListRev((r) => r + 1)
                    }}
                  />
                )}
                {chromePanel === 'downloads' && (
                  <DownloadsManagerPanel
                    key={panelRev}
                    onChanged={() => setPanelRev((r) => r + 1)}
                  />
                )}
                {chromePanel === 'settings' && (
                  <SettingsManagerPanel
                    onSettingsSaved={(next) => {
                      setSettings(next)
                      saveBrowserSettings(next)
                      void syncBrowserSettingsToMain()
                    }}
                  />
                )}
                {chromePanel === 'inspector' && (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                    <DevToolsDomInspectorPanel
                      activeTabId={activeTabId}
                      onAiRequest={onInspectorAiRequest}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    } else {
      embeddedBrowserMain = (
        <div className="text-muted-foreground flex min-h-[min(520px,60vh)] items-center justify-center text-sm">
          Preparing browser…
        </div>
      )
    }
  } else {
    // Electron strips X-Frame-Options via session.webRequest — load directly.
    // Web dev mode goes through the Vite browse-proxy to strip headers server-side.
    const iframeSrc = isElectronDesktop() ? src : proxyUrlForIframe(src)
    embeddedBrowserMain = (
      <>
        {settings.showBookmarksBar && bookmarks.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-muted/20 px-2 py-1">
            {bookmarks.slice(0, 24).map((b: Bookmark) => (
              <Button
                key={b.id}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 max-w-[140px] truncate px-2 text-xs"
                title={b.url}
                onClick={() => navigateActive(b.url)}
              >
                {b.title}
              </Button>
            ))}
          </div>
        )}
        <iframe
          key={`${src}-${reloadNonce}`}
          title="Embedded browser"
          src={iframeSrc}
          className={iframeClassName}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </>
    )
  }

  const runFind = (forward: boolean) => {
    if (!useWebview || !findQuery.trim()) return
    try {
      activeWebview?.getWebContents().findInPage(findQuery, { forward, findNext: true })
    } catch {
      /* ignore */
    }
  }

  const stopFind = () => {
    const w = activeWebview
    if (!w) return
    try {
      w.getWebContents().stopFindInPage('clearSelection')
    } catch {
      /* ignore */
    }
  }

  const applyZoom = (pct: number) => {
    if (!useWebview) return
    const w = activeWebview
    if (!w) return
    try {
      w.setZoomFactor(pct / 100)
      setZoomLabel(`${pct}%`)
    } catch {
      /* ignore */
    }
  }

  const openDevTools = () => {
    try {
      activeWebview?.openDevTools()
    } catch {
      /* ignore */
    }
  }

  const loadExtension = async () => {
    const api = window.electronInAppBrowser
    if (!api) return
    const folder = await api.pickExtensionFolder()
    if (!folder) return
    const r = await api.loadExtensionFolder(folder)
    if (r.ok) {
      toast.success(`Extension loaded: ${r.name ?? folder}`, { description: r.version })
    } else {
      toast.error(r.error ?? 'Failed to load extension')
    }
  }

  const bookmarkCurrent = () => {
    const u = useWebview ? activeTab?.url : src
    let pageTitle = 'Page'
    if (!useWebview && src) {
      try { pageTitle = new URL(src).hostname } catch { /* keep default */ }
    }
    const title = useWebview ? activeTab?.title : pageTitle
    if (!u || u === 'about:blank') {
      toast.warning('Nothing to bookmark')
      return
    }
    try {
      addBookmark(u, title || u)
      setListRev((r) => r + 1)
      setPanelRev((r) => r + 1)
      toast.success('Bookmark added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add bookmark')
    }
  }

  return (
    <>
      {open && minimized && (
        <div
          className="fixed bottom-4 right-4 z-[60] flex max-w-[min(100vw-2rem,420px)] items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          role="region"
          aria-label="Web browser minimized"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={src}>
            {minimizedLabel}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={restoreFromMinimized}
            title="Restore"
          >
            <ArrowsOutCardinal size={16} />
            Restore
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={dismissMinimized}
            title="Close"
            aria-label="Close web browser"
          >
            <LucideX className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={open && !minimized} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-jarvis-browser-content=""
          className={cn(
            'flex flex-col gap-0 overflow-hidden p-0',
            // Electron <webview> often composites to black if any ancestor uses CSS transform / zoom animation.
            // Radix DialogContent uses translate centering + zoom-in keyframes (transform); disable for this surface.
            '!translate-x-0 !translate-y-0 !transform-none !scale-100',
            'data-[state=open]:!animate-none data-[state=closed]:!animate-none',
            'duration-0',
            expanded
              ? cn(
                  'h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-0 shadow-none',
                  'fixed inset-0 left-0 top-0',
                  'sm:max-w-none sm:rounded-none'
                )
              : cn(
                  'fixed left-4 right-4 top-[max(1rem,4vh)] z-50 mx-auto max-h-[min(92vh,800px)] w-full max-w-4xl sm:left-8 sm:right-8 sm:max-w-4xl'
                )
          )}
          style={{ transform: 'none' }}
        >
          <ToastHost scope="browser" />
          {guideHighlight ? (
            <GuidanceHighlight
              targetRect={{
                x: guideHighlight.x,
                y: guideHighlight.y,
                width: guideHighlight.width,
                height: guideHighlight.height,
              }}
              label={guideHighlight.label}
            />
          ) : null}
          <div className="relative shrink-0 border-b border-border px-6 pt-6 pr-[10rem] sm:pr-[11rem]">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute top-4 right-[6.5rem] z-10 h-9 w-9"
              onClick={minimize}
              title="Minimise"
              aria-label="Minimise"
            >
              <Minus size={18} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute top-4 right-[3.75rem] z-10 h-9 w-9"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? 'Shrink panel' : 'Expand panel'}
              aria-expanded={expanded}
              aria-label={expanded ? 'Shrink panel' : 'Expand panel'}
            >
              {expanded ? <ArrowsInSimple size={18} /> : <ArrowsOutSimple size={18} />}
            </Button>
            <div className="space-y-1 pr-2">
              <DialogHeader className="p-0">
                <DialogTitle className="flex items-center gap-3">
                  Jarvis Browser
                  {automating && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Jarvis is browsing
                    </span>
                  )}
                  {useWebview && (
                    <span className="ml-auto flex items-center gap-2 text-xs font-normal">
                      <Switch
                        id="guide-mode"
                        checked={guideMode}
                        onCheckedChange={setGuideMode}
                        className="scale-75"
                      />
                      <Label htmlFor="guide-mode" className="text-muted-foreground cursor-pointer text-xs">
                        Guide Mode
                      </Label>
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground text-sm">
                {isElectronDesktop()
                  ? 'Embedded browser. Bookmarks and history persist locally.'
                  : 'Embedded browser via dev proxy. Some complex sites may need the desktop app.'}
              </p>
            </div>
          </div>

          {!isElectronDesktop() && !useWebview && (
            <div className="px-6 pt-2">
              <Alert>
                <AlertTitle>Web proxy mode</AlertTitle>
                <AlertDescription>
                  Pages load through a local proxy. For full features run{' '}
                  <code className="font-mono text-xs">npm run desktop:dev</code>.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {useWebview && (
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-3 py-2">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addTab} title="New tab">
                <Plus size={16} />
              </Button>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1 overflow-x-auto">
                {sortedTabs.map((tab) => (
                  <ContextMenu key={tab.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTabId(tab.id)
                          setChromePanel('main')
                          setInput(tab.url === 'about:blank' ? '' : tab.url)
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault()
                            closeTabById(tab.id)
                          }
                        }}
                        className={cn(
                          'flex max-w-[160px] items-center gap-1 rounded-md border px-2 py-1 text-xs',
                          tab.id === activeTabId
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {tab.faviconUrl ? (
                          <img src={tab.faviconUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                        ) : null}
                        <span className="truncate">{tab.title || 'Tab'}</span>
                        {tabs.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="hover:bg-background/80 shrink-0 rounded p-0.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              closeTabById(tab.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                closeTabById(tab.id)
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => closeTabById(tab.id)}>Close</ContextMenuItem>
                      <ContextMenuItem onClick={() => closeOthers(tab.id)}>Close others</ContextMenuItem>
                      <ContextMenuItem onClick={() => closeToTheRight(tab.id)}>Close to the right</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => pinTab(tab.id)}>
                        {tab.isPinned ? 'Unpin' : 'Pin'}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Bookmarks manager"
                onClick={() => setChromePanel('bookmarks')}
              >
                <List size={18} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="DOM inspector"
                onClick={() => setChromePanel('inspector')}
              >
                <TreeStructure size={18} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Settings"
                onClick={() => setChromePanel('settings')}
              >
                <Gear size={18} />
              </Button>
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/20 px-6 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canBack}
                onClick={back}
                title="Back"
              >
                <ArrowLeft size={18} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canForward}
                onClick={forward}
                title="Forward"
              >
                <ArrowRight size={18} />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={reload} title="Reload">
                <ArrowClockwise size={18} />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={goHome} title="Home">
                <House size={18} />
              </Button>
              {useWebview && loading && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={stopLoad} title="Stop">
                  Stop
                </Button>
              )}
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    go()
                  }
                }}
                placeholder="Enter URL or search…"
                className="min-w-0 flex-1 font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
              />
              <Button type="button" size="sm" className="shrink-0" onClick={go}>
                Go
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={useWebview ? !activeTab?.url || activeTab.url === 'about:blank' : !src || src === 'about:blank'}
                onClick={openExternal}
                title="Open in new tab"
              >
                <ExternalLink className="h-[18px] w-[18px]" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Bookmarks">
                    <BookmarkSimple size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 w-72 overflow-y-auto">
                  <DropdownMenuLabel>
                    <span className="flex items-center justify-between gap-2">
                      Bookmarks
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={bookmarkCurrent}>
                        Add current
                      </Button>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {bookmarks.length === 0 ? (
                    <DropdownMenuItem disabled>No bookmarks yet</DropdownMenuItem>
                  ) : (
                    bookmarks.map((b: Bookmark) => (
                      <DropdownMenuItem
                        key={b.id}
                        className="flex items-start justify-between gap-2"
                        onClick={() => {
                          setInput(b.url)
                          navigateActive(b.url)
                        }}
                      >
                        <span className="truncate">{b.title}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBookmark(b.id)
                            setListRev((r) => r + 1)
                            toast.success('Removed')
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="History">
                    <ClockCounterClockwise size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 w-72 overflow-y-auto">
                  <DropdownMenuLabel>
                    <span className="flex items-center justify-between gap-2">
                      History
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setChromePanel('history')}
                      >
                        Full page
                      </Button>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {history.length === 0 ? (
                    <DropdownMenuItem disabled>No history</DropdownMenuItem>
                  ) : (
                    history.slice(0, 30).map((h) => (
                      <DropdownMenuItem
                        key={h.id}
                        className="truncate"
                        onClick={() => {
                          setInput(h.url)
                          navigateActive(h.url)
                        }}
                      >
                        {h.title}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {useWebview && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Downloads"
                    onClick={() => setChromePanel('downloads')}
                  >
                    <DownloadSimple size={18} />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="shrink-0" title="Zoom">
                        {zoomLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => applyZoom(75)}>75%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => applyZoom(100)}>100%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => applyZoom(125)}>125%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => applyZoom(150)}>150%</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant={findOpen ? 'secondary' : 'outline'}
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Find in page"
                    onClick={() => setFindOpen((f) => !f)}
                  >
                    <MagnifyingGlass size={18} />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Developer tools"
                    onClick={openDevTools}
                  >
                    <Code size={18} />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Load unpacked extension"
                    onClick={() => {
                      loadExtension().catch(() => {})
                    }}
                  >
                    <PuzzlePiece size={18} />
                  </Button>
                </>
              )}
            </div>
            {useWebview && findOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Find in page…"
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runFind(e.shiftKey ? false : true)
                  }}
                  className="max-w-xs font-mono text-sm"
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => runFind(false)}>
                  Previous
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => runFind(true)}>
                  Next
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={stopFind}>
                  Clear
                </Button>
              </div>
            )}
          </div>

          <div
            className={
              expanded
                ? 'flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2 sm:px-4'
                : 'min-h-0 flex-1 px-6 pb-2 pt-2'
            }
          >
            <div
              className={
                expanded
                  ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-inner'
                  : 'relative flex min-h-[min(520px,60vh)] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-inner'
              }
            >
              {embeddedBrowserMain}
            </div>

            {automating && agentSteps.length > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/30">
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-muted/50 flex w-full items-center justify-between px-4 py-2 text-xs font-medium transition-colors"
                  onClick={() => setStepsExpanded((e) => !e)}
                >
                  <span>Agent Steps ({agentSteps.length})</span>
                  <span className={cn('inline-block text-[10px] transition-transform', stepsExpanded && 'rotate-180')}>
                    ▼
                  </span>
                </button>
                {stepsExpanded && (
                  <div className="max-h-32 space-y-1 overflow-y-auto px-4 pb-2">
                    {agentSteps.map((step, i) => (
                      <div key={`${step.timestamp}-${i}`} className="flex items-start gap-2 text-[11px]">
                        <span className="text-muted-foreground shrink-0 font-mono">{i + 1}.</span>
                        <span className="text-muted-foreground">
                          <span className="text-foreground font-medium">{step.action}</span>
                          {' — '}
                          {step.result.slice(0, 120)}
                          {step.result.length > 120 ? '...' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3">
            <p className="text-muted-foreground text-xs leading-relaxed">
              {useWebview ? (
                <>
                  Programmatic API: import <code className="rounded bg-muted px-1 py-0.5 text-[11px]">JarvisBrowser</code> from{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">@/browser/jarvis-browser-runtime</code>. See{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">docs/electron-browser-extensions.md</code> for
                  extensions.
                </>
              ) : (
                <>
                  {isElectronDesktop() ? 'Embedded browser mode.' : 'Browsing via dev proxy.'}{' '}
                  <a
                    href={src !== 'about:blank' ? src : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-accent inline-flex items-center gap-1 underline underline-offset-2 ${src === 'about:blank' ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in system browser
                  </a>
                </>
              )}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
