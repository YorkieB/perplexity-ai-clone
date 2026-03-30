import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
} from '@phosphor-icons/react'
import { ExternalLink, X as LucideX } from 'lucide-react'
import { randomIdSegment } from '@/lib/secure-random'
import { cn } from '@/lib/utils'
import { isElectronWebviewAvailable } from '@/lib/electron-browser'
import {
  addBookmark,
  appendHistory,
  loadBookmarks,
  loadHistory,
  removeBookmark,
  clearHistory,
  type BrowserBookmark,
} from '@/lib/in-app-browser-storage'
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
} from '@/lib/browser-agent-scripts'

const LAST_URL_KEY = 'web-browser-modal-last-url'
const MAX_TABS = 12

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return 'about:blank'
  if (/^about:/i.test(t)) return t
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function generateTabId(): string {
  return `t_${Date.now()}_${randomIdSegment()}`
}

interface NavState {
  stack: string[]
  index: number
}

interface WebBrowserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestOpen?: () => void
}

export function WebBrowserModal({ open, onOpenChange, onRequestOpen }: WebBrowserModalProps) {
  const useWebview = isElectronWebviewAvailable()
  const partition = window.electronInAppBrowser?.webviewPartition ?? ''
  const { register, unregister } = useBrowserControlRegister()
  const { guideMode, setGuideMode } = useBrowserGuideMode()
  const { automating } = useBrowserAutomating()
  const { agentSteps } = useBrowserAgentSteps()
  const [stepsExpanded, setStepsExpanded] = useState(false)

  const [input, setInput] = useState('')
  const [nav, setNav] = useState<NavState>({ stack: ['about:blank'], index: 0 })
  const [reloadNonce, setReloadNonce] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [minimized, setMinimized] = useState(false)

  const [tabs, setTabs] = useState<BrowserTabModel[]>(() => [
    { id: generateTabId(), srcAtCreate: 'about:blank', url: 'about:blank', title: 'New tab' },
  ])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? '')
  const webviews = useRef<Map<string, InAppWebview>>(new Map())
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const [loading, setLoading] = useState(false)
  const [navTick, setNavTick] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [zoomLabel, setZoomLabel] = useState('100%')
  /** Avoid mounting `<webview>` until session tabs are synced (useLayoutEffect); prevents guest/DOM races. */
  const [webviewShellReady, setWebviewShellReady] = useState(false)

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId])
  const src = useMemo(() => nav.stack[nav.index] ?? 'about:blank', [nav.stack, nav.index])

  const [listRev, setListRev] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bookmarks = useMemo(() => loadBookmarks(), [listRev])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => loadHistory(), [listRev])

  const activeWebview = webviews.current.get(activeTabId)

  const canBack = useMemo(() => {
    if (navTick < 0) return false
    if (!useWebview) return nav.index > 0
    const w = webviews.current.get(activeTabId)
    if (!w) return false
    try {
      return w.canGoBack()
    } catch {
      /* Electron: guest not attached / dom-ready not fired yet */
      return false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useWebview, activeTabId, nav.index, nav.stack.length, navTick])

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

  const pushUrlIframe = useCallback((raw: string) => {
    const u = normalizeUrl(raw)
    setNav((prev) => {
      const stack = prev.stack.slice(0, prev.index + 1)
      stack.push(u)
      return { stack, index: stack.length - 1 }
    })
    try {
      if (u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u)
    } catch {
      /* ignore */
    }
  }, [])

  const onWebviewMount = useCallback((tabId: string, el: InAppWebview | null) => {
    if (el) webviews.current.set(tabId, el)
    else webviews.current.delete(tabId)
    setNavTick((n) => n + 1)
  }, [])

  const onDidNavigate = useCallback(
    (tabId: string, url: string) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, url: url || t.url } : t))
      )
      if (tabId === activeTabIdRef.current) {
        setInput(url === 'about:blank' ? '' : url)
      }
      appendHistory(url, url)
      setListRev((r) => r + 1)
      setNavTick((n) => n + 1)
    },
    []
  )

  const onPageTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: title || t.title } : t)))
  }, [])

  const onNewWindow = useCallback(
    (url: string) => {
      const u = normalizeUrl(url)
      if (tabs.length >= MAX_TABS) {
        toast.warning('Tab limit reached')
        return
      }
      const id = generateTabId()
      setTabs((prev) => [...prev, { id, srcAtCreate: u, url: u, title: u }])
      setActiveTabId(id)
    },
    [tabs.length]
  )

  useEffect(() => {
    if (!open) {
      setMinimized(false)
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
    try {
      const last = localStorage.getItem(LAST_URL_KEY)?.trim()
      if (useWebview) {
        const u = last ? normalizeUrl(last) : 'about:blank'
        const id = generateTabId()
        setTabs([{ id, srcAtCreate: u, url: u, title: u === 'about:blank' ? 'New tab' : u }])
        setActiveTabId(id)
        setInput(u === 'about:blank' ? '' : u)
        setWebviewShellReady(true)
      } else {
        setWebviewShellReady(false)
        if (last) {
          const u = normalizeUrl(last)
          setNav({ stack: [u], index: 0 })
        } else {
          setNav({ stack: ['about:blank'], index: 0 })
        }
      }
    } catch {
      if (useWebview) {
        const id = generateTabId()
        setTabs([
          { id, srcAtCreate: 'about:blank', url: 'about:blank', title: 'New tab' },
        ])
        setActiveTabId(id)
        setInput('')
        setWebviewShellReady(true)
      } else {
        setNav({ stack: ['about:blank'], index: 0 })
      }
    }
  }, [open, useWebview])

  useEffect(() => {
    if (useWebview) return
    const u = nav.stack[nav.index] ?? 'about:blank'
    setInput(u === 'about:blank' ? '' : u)
  }, [nav.stack, nav.index, useWebview])

  useEffect(() => {
    if (!useWebview || !window.electronInAppBrowser) return
    const off = window.electronInAppBrowser.onDownloadComplete((p) => {
      toast.success(`Downloaded: ${p.filename}`, { description: p.path })
    })
    return off
  }, [useWebview])

  // ── Register browser control for Jarvis agent ──
  useEffect(() => {
    if (!useWebview) return

    function getActiveWv(): InAppWebview | null {
      return webviews.current.get(activeTabIdRef.current) ?? null
    }

    const control: BrowserControl = {
      navigate: (url: string) => new Promise((resolve) => {
        const w = getActiveWv()
        if (!w) {
          resolve({ ok: false, url: '', title: '' })
          return
        }
        const u = normalizeUrl(url)
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          w.removeEventListener('did-stop-loading', onStop)
          let finalUrl = u
          try { finalUrl = w.getURL() } catch { /* */ }
          resolve({ ok: true, url: finalUrl, title: '' })
        }, 15000)
        const onStop = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          w.removeEventListener('did-stop-loading', onStop)
          let finalUrl = u
          try { finalUrl = w.getURL() } catch { /* ignore */ }
          const tab = tabsRef.current.find(t => t.id === activeTabIdRef.current)
          resolve({ ok: true, url: finalUrl, title: tab?.title ?? '' })
        }
        w.addEventListener('did-stop-loading', onStop)
        try {
          w.loadURL(u)
          try { if (u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u) } catch { /* */ }
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
        try { w.goBack(); return { ok: true } } catch { return { ok: false } }
      },

      goForward: async () => {
        const w = getActiveWv()
        if (!w) return { ok: false }
        try { w.goForward(); return { ok: true } } catch { return { ok: false } }
      },

      getCurrentUrl: () => {
        const w = getActiveWv()
        if (!w) return 'about:blank'
        try { return w.getURL() } catch { return 'about:blank' }
      },

      isOpen: () => open,
      openBrowser: () => { onRequestOpen?.() },

      newTab: (url?: string) => new Promise((resolve) => {
        const currentTabs = tabsRef.current
        if (currentTabs.length >= MAX_TABS) {
          resolve({ ok: false, tabId: '' })
          return
        }
        const id = generateTabId()
        const u = url ? normalizeUrl(url) : 'about:blank'
        setTabs(prev => [...prev, { id, srcAtCreate: u, url: u, title: u === 'about:blank' ? 'New tab' : u }])
        setActiveTabId(id)
        setInput(u === 'about:blank' ? '' : u)
        resolve({ ok: true, tabId: id })
      }),

      switchTab: (tabId: string) => new Promise((resolve) => {
        const tab = tabsRef.current.find(t => t.id === tabId)
        if (!tab) { resolve({ ok: false }); return }
        setActiveTabId(tabId)
        setInput(tab.url === 'about:blank' ? '' : tab.url)
        resolve({ ok: true })
      }),

      closeTab: (tabId: string) => new Promise((resolve) => {
        const currentTabs = tabsRef.current
        if (currentTabs.length <= 1) { resolve({ ok: false }); return }
        const idx = currentTabs.findIndex(t => t.id === tabId)
        if (idx < 0) { resolve({ ok: false }); return }
        webviews.current.delete(tabId)
        const remaining = currentTabs.filter(t => t.id !== tabId)
        setTabs(remaining)
        if (activeTabIdRef.current === tabId) {
          const next = remaining[Math.min(idx, remaining.length - 1)]
          setActiveTabId(next.id)
          setInput(next.url === 'about:blank' ? '' : next.url)
        }
        resolve({ ok: true })
      }),

      listTabs: () => tabsRef.current.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.id === activeTabIdRef.current,
      })),
    }

    register(control)
    return () => { unregister() }
  }, [useWebview, open, register, unregister, onRequestOpen])

  const go = () => {
    const u = normalizeUrl(input || 'about:blank')
    if (useWebview) {
      const w = webviews.current.get(activeTabId)
      if (w) {
        try {
          w.loadURL(u)
        } catch {
          toast.error('Web view is not ready yet. Try again in a moment.')
          return
        }
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, url: u, srcAtCreate: t.srcAtCreate } : t))
        )
      }
      try {
        if (u !== 'about:blank') localStorage.setItem(LAST_URL_KEY, u)
      } catch {
        /* ignore */
      }
    } else {
      pushUrlIframe(input || 'about:blank')
    }
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
    setTabs((prev) => [...prev, { id, srcAtCreate: 'about:blank', url: 'about:blank', title: 'New tab' }])
    setActiveTabId(id)
    setInput('')
  }

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0 || tabs.length <= 1) return
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    webviews.current.delete(id)
    if (id === activeTabId) {
      const newActive = next[Math.max(0, idx - 1)] ?? next[0]
      setActiveTabId(newActive.id)
      setInput(newActive.url === 'about:blank' ? '' : newActive.url)
    }
  }

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) onOpenChange(false)
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
          const s = String(rawBrowserUrl).replace(/^https?:\/\//i, '')
          return s.length > 44 ? `${s.slice(0, 44)}…` : s
        })()
      : 'Web browser'

  const iframeClassName = expanded
    ? 'h-full min-h-0 w-full flex-1 border-0 bg-white dark:bg-zinc-950'
    : 'h-[min(520px,60vh)] w-full border-0 bg-white dark:bg-zinc-950'

  let embeddedBrowserMain: ReactNode
  if (useWebview) {
    if (webviewShellReady) {
      embeddedBrowserMain = (
        <div className="flex min-h-0 flex-1 flex-col">
          <InAppBrowserWebviewArea
            partition={partition}
            tabs={tabs}
            activeTabId={activeTabId}
            expanded={expanded}
            onWebviewMount={onWebviewMount}
            onDidNavigate={onDidNavigate}
            onPageTitle={onPageTitle}
            onNewWindow={onNewWindow}
            onLoadingChange={setLoading}
          />
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
    embeddedBrowserMain = (
      <iframe
        key={`${src}-${reloadNonce}`}
        title="Embedded browser"
        src={src}
        className={iframeClassName}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
        referrerPolicy="no-referrer-when-downgrade"
      />
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
    const title = useWebview ? activeTab?.title : 'Page'
    if (!u || u === 'about:blank') {
      toast.warning('Nothing to bookmark')
      return
    }
    try {
      addBookmark(u, title || u)
      setListRev((r) => r + 1)
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

      <Dialog open={open && !minimized} onOpenChange={handleDialogOpenChange} modal={!expanded}>
        <DialogContent
          className={cn(
            'flex flex-col gap-0 overflow-hidden p-0',
            expanded
              ? cn(
                  'h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-0 shadow-none',
                  'fixed inset-0 left-0 top-0 translate-x-0 translate-y-0',
                  'sm:max-w-none sm:rounded-none'
                )
              : 'max-h-[min(92vh,800px)] w-full max-w-4xl sm:max-w-4xl'
          )}
          onInteractOutside={(e) => { e.preventDefault() }}
          onOpenAutoFocus={(e) => { e.preventDefault() }}
          overlayClassName={expanded ? 'hidden' : undefined}
        >
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
                  Web browser
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
                      <Label htmlFor="guide-mode" className="text-xs text-muted-foreground cursor-pointer">
                        Guide Mode
                      </Label>
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground text-sm">
                {useWebview
                  ? 'Embedded Chromium (desktop). Downloads go to your system Downloads folder.'
                  : 'Browse in an embedded frame. Full browser features require the desktop app — use'}
                {!useWebview && (
                  <>
                    {' '}
                    <span className="text-foreground/90">Open in tab</span> for sites that block embedding.
                  </>
                )}
              </p>
            </div>
          </div>

          {!useWebview && (
            <div className="px-6 pt-2">
              <Alert>
                <AlertTitle>Desktop app</AlertTitle>
                <AlertDescription>
                  Run <code className="font-mono text-xs">npm run desktop:dev</code> or{' '}
                  <code className="font-mono text-xs">npm run desktop</code> for tabs, real navigation, downloads,
                  DevTools, and optional extensions.
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
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTabId(tab.id)
                      setInput(tab.url === 'about:blank' ? '' : tab.url)
                    }}
                    className={cn(
                      'flex max-w-[140px] items-center gap-1 rounded-md border px-2 py-1 text-xs',
                      tab.id === activeTabId
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <span className="truncate">{tab.title || 'Tab'}</span>
                    {tabs.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="shrink-0 rounded p-0.5 hover:bg-background/80"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            closeTab(tab.id)
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
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
                placeholder="Enter URL or search terms…"
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

              {useWebview && (
                <>
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
                        bookmarks.map((b: BrowserBookmark) => (
                          <DropdownMenuItem
                            key={b.id}
                            className="flex items-start justify-between gap-2"
                            onClick={() => {
                              setInput(b.url)
                              const w = webviews.current.get(activeTabId)
                              if (!w) return
                              try {
                                w.loadURL(b.url)
                              } catch {
                                toast.error('Web view is not ready yet.')
                              }
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
                            onClick={() => {
                              clearHistory()
                              setListRev((r) => r + 1)
                              toast.success('History cleared')
                            }}
                          >
                            Clear
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
                              const w = webviews.current.get(activeTabId)
                              if (!w) return
                              try {
                                w.loadURL(h.url)
                              } catch {
                                toast.error('Web view is not ready yet.')
                              }
                            }}
                          >
                            {h.title}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

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
                    onClick={() => { loadExtension().catch(() => {}) }}
                  >
                    <DownloadSimple size={18} />
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
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-inner'
                  : 'overflow-hidden rounded-xl border border-border bg-background shadow-inner'
              }
            >
              {embeddedBrowserMain}
            </div>

            {automating && agentSteps.length > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/30">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setStepsExpanded(e => !e)}
                >
                  <span>Agent Steps ({agentSteps.length})</span>
                  <span className={cn('inline-block text-[10px] transition-transform', stepsExpanded && 'rotate-180')}>▼</span>
                </button>
                {stepsExpanded && (
                  <div className="max-h-32 overflow-y-auto px-4 pb-2 space-y-1">
                    {agentSteps.map((step, i) => (
                      <div key={`${step.timestamp}-${i}`} className="flex items-start gap-2 text-[11px]">
                        <span className="shrink-0 font-mono text-muted-foreground">{i + 1}.</span>
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">{step.action}</span>
                          {' — '}
                          {step.result.slice(0, 120)}{step.result.length > 120 ? '...' : ''}
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
                  Downloads are saved to your default Downloads folder. Optional extensions:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ELECTRON_BROWSER_EXTENSION_PATH</code> in
                  .env (unpacked folder), or use Load extension. See{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">docs/electron-browser-extensions.md</code>.
                </>
              ) : (
                <>
                  Many sites send <code className="rounded bg-muted px-1 py-0.5 text-[11px]">X-Frame-Options</code> or CSP
                  headers that prevent embedding; that is enforced by the browser, not this app.{' '}
                  <a
                    href={src !== 'about:blank' ? src : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-accent underline underline-offset-2 ${src === 'about:blank' ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open current page in system browser
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
