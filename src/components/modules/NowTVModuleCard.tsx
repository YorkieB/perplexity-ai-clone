import { ExternalLink, Play, Tv } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getNowTvBookmarks, getNowTvHomeUrl, type NowTvBookmarkRow } from '@/lib/nowtv-bookmarks'
import { cn } from '@/lib/utils'

function RowInner({ item }: Readonly<{ item: NowTvBookmarkRow }>) {
  const body = (
    <>
      <div className="relative flex size-14 shrink-0 items-center justify-center rounded bg-gradient-to-br from-violet-600/80 to-fuchsia-800/80">
        <Play className="size-6 text-white/90 drop-shadow" aria-hidden />
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] text-white">
          {item.meta}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-xs font-medium text-violet-50">{item.title}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-fuchsia-400"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>
    </>
  )

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex gap-2 rounded-lg border border-white/5 bg-black/25 p-2 transition-colors',
          'hover:border-violet-400/20 hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50'
        )}
      >
        {body}
      </a>
    )
  }

  return <div className="flex gap-2 rounded-lg border border-white/5 bg-black/25 p-2">{body}</div>
}

/**
 * NOW-style “continue watching” rail: sample data or `VITE_NOWTV_BOOKMARKS` (not linked to NOW).
 */
export function NowTVModuleCard() {
  const { rows, fromEnv } = getNowTvBookmarks()
  const homeUrl = getNowTvHomeUrl()

  return (
    <Card className="gap-3 overflow-hidden border-violet-500/25 bg-gradient-to-b from-violet-950/40 to-card py-4 shadow-none dark:border-violet-400/20">
      <CardHeader className="px-4 pb-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-fuchsia-600/30">
            <Tv className="size-4 text-fuchsia-200" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base text-violet-50">NOW</CardTitle>
            <CardDescription className="text-[10px] text-violet-200/70">
              {fromEnv ? 'Your bookmarks' : 'Sample picks · not linked to NOW'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">Continue watching</p>
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={`${item.title}|${item.meta}|${item.progress}|${item.href ?? ''}`}>
              <RowInner item={item} />
            </li>
          ))}
        </ul>
        <a
          href={homeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-violet-400/30 bg-violet-950/50 py-2 text-center text-[11px] font-medium text-violet-100 hover:bg-violet-900/50"
        >
          Open NOW
          <ExternalLink className="size-3.5 opacity-80" aria-hidden />
        </a>
      </CardContent>
    </Card>
  )
}
