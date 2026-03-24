import { useEffect, useMemo, useRef } from 'react'
import { ExternalLink, Share2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
declare global {
  interface Window {
    twttr?: { widgets: { load: (el?: Element | null) => void } }
    instgrm?: { Embeds: { process: () => void } }
  }
}

const TW_WIDGET_SRC = 'https://platform.twitter.com/widgets.js'
const IG_EMBED_SRC = 'https://www.instagram.com/embed.js'

function getXScreenName(): string {
  const raw = import.meta.env.VITE_SOCIAL_X_SCREEN_NAME?.trim()
  const name = (raw || 'BBCBreaking').replace(/^@/, '')
  return name || 'BBCBreaking'
}

function parseThreadsPostUrls(): string[] {
  const raw = import.meta.env.VITE_THREADS_POST_URLS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((u) => u.startsWith('http') && u.includes('threads.net'))
}

function ensureTwitterScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${TW_WIDGET_SRC}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = TW_WIDGET_SRC
    s.async = true
    s.charset = 'utf-8'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Twitter widgets script failed'))
    document.body.appendChild(s)
  })
}

function ensureInstagramEmbedScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${IG_EMBED_SRC}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = IG_EMBED_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Instagram embed script failed'))
    document.body.appendChild(s)
  })
}

function XTimelineEmbed({ screenName }: { readonly screenName: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    host.innerHTML = ''
    const a = document.createElement('a')
    a.className = 'twitter-timeline'
    a.setAttribute('data-height', '320')
    a.setAttribute('data-theme', 'dark')
    a.setAttribute('data-chrome', 'noheader nofooter transparent')
    a.href = `https://twitter.com/${screenName}`
    a.textContent = `Posts by @${screenName}`
    host.appendChild(a)

    let cancelled = false

    void (async () => {
      try {
        await ensureTwitterScript()
        if (cancelled) return
        window.twttr?.widgets?.load(host)
      } catch {
        host.innerHTML = `<p class="p-2 text-xs text-muted-foreground">Could not load X timeline. Try again later or check your network.</p>`
      }
    })()

    return () => {
      cancelled = true
      host.innerHTML = ''
    }
  }, [screenName])

  return (
    <div className="min-h-[200px] w-full min-w-0 overflow-hidden">
      <div ref={hostRef} className="w-full" />
    </div>
  )
}

function ThreadsEmbeds({ urls }: { readonly urls: readonly string[] }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || urls.length === 0) return

    host.innerHTML = ''
    for (const url of urls) {
      const bq = document.createElement('blockquote')
      bq.className = 'instagram-media'
      bq.setAttribute('data-instgrm-permalink', url)
      bq.setAttribute('data-instgrm-version', '14')
      bq.style.cssText = 'background:transparent;border:0;margin:0 0 12px;max-width:100%;min-width:0;width:100%;'
      host.appendChild(bq)
    }

    let cancelled = false

    void (async () => {
      try {
        await ensureInstagramEmbedScript()
        if (cancelled) return
        window.instgrm?.Embeds.process()
      } catch {
        if (!cancelled) {
          host.innerHTML = `<p class="text-xs text-muted-foreground">Could not load Threads embeds.</p>`
        }
      }
    })()

    return () => {
      cancelled = true
      host.innerHTML = ''
    }
  }, [urls])

  if (urls.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p>No Threads post URLs configured. Add comma-separated post links in the environment.</p>
        <a
          href="https://www.threads.net"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-accent"
        >
          Open Threads
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[min(320px,45vh)] pr-2">
      <div ref={hostRef} className="w-full min-w-0 space-y-3 pb-2" />
    </ScrollArea>
  )
}

/**
 * Live X (Twitter) profile timeline + embedded Threads posts (Meta embed script).
 * Configure `VITE_SOCIAL_X_SCREEN_NAME` and optional `VITE_THREADS_POST_URLS` (comma-separated post URLs).
 */
export function SocialTimelineModuleCard() {
  const screenName = useMemo(() => getXScreenName(), [])
  const threadsUrls = useMemo(() => parseThreadsPostUrls(), [])

  return (
    <Card className="gap-2 overflow-hidden py-4 shadow-none">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-muted">
              <Share2 className="size-4 text-foreground" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base">Social</CardTitle>
              <CardDescription className="text-[10px]">X · Threads</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pt-0">
        <Tabs defaultValue="x" className="w-full gap-2">
          <TabsList className="grid h-8 w-full grid-cols-2 p-0.5">
            <TabsTrigger value="x" className="text-xs">
              X
            </TabsTrigger>
            <TabsTrigger value="threads" className="text-xs">
              Threads
            </TabsTrigger>
          </TabsList>
          <TabsContent value="x" className="mt-0 outline-none">
            <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
              Live posts from{' '}
              <span className="font-medium text-foreground">@{screenName}</span>
              <span className="block font-mono text-[9px] opacity-80">VITE_SOCIAL_X_SCREEN_NAME</span>
            </p>
            <div className="w-full min-w-0">
              <XTimelineEmbed key={screenName} screenName={screenName} />
            </div>
          </TabsContent>
          <TabsContent value="threads" className="mt-0 outline-none">
            <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
              Embedded posts (Meta embed).{' '}
              <span className="font-mono text-[9px]">VITE_THREADS_POST_URLS</span>
            </p>
            <ThreadsEmbeds urls={threadsUrls} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
