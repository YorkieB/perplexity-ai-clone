'use client'

import { format, parseISO } from 'date-fns'
import { Brain, Eye, Zap } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReActTraceEntry } from '@/hooks/useJarvisTelemetry'

export interface ReasoningTraceProps {
  traces: ReActTraceEntry[]
  /** Last N steps shown (oldest dropped). Default 15. */
  maxVisible?: number
}

function traceRowKey(t: ReActTraceEntry): string {
  const snippet = t.content.length > 160 ? `${t.content.slice(0, 160)}…` : t.content
  return `${t.sessionId}\u001f${t.timestamp}\u001f${t.step}\u001f${snippet}`
}

function formatStepTime(iso: string): string {
  try {
    return format(parseISO(iso), 'HH:mm:ss')
  } catch {
    return '—'
  }
}

function confidenceBadgeClass(pct: number): string {
  if (pct >= 75) return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
  if (pct >= 60) return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
  return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200'
}

interface TraceStepCardProps {
  trace: ReActTraceEntry
  expanded: boolean
  onToggleExpand: () => void
}

function stepIcon(step: ReActTraceEntry['step']) {
  if (step === 'thought') return Brain
  if (step === 'action') return Zap
  return Eye
}

function stepLabel(step: ReActTraceEntry['step']): string {
  if (step === 'thought') return 'Thought'
  if (step === 'action') return 'Action'
  return 'Observation'
}

function stepAccentClass(step: ReActTraceEntry['step']): string {
  if (step === 'thought') return 'border-l-4 border-l-blue-500 bg-blue-500/[0.05]'
  if (step === 'action') return 'border-l-4 border-l-violet-500 bg-violet-500/[0.05]'
  return 'border-l-4 border-l-emerald-500 bg-emerald-500/[0.05]'
}

const CARD_BASE =
  'animate-in fade-in slide-in-from-bottom-2 ease-out relative rounded-lg border border-border/60 pl-4 pr-3 py-3 shadow-sm duration-200'

function onThoughtKeyDown(e: KeyboardEvent, onToggleExpand: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onToggleExpand()
  }
}

function ThoughtBody({
  content,
  expanded,
  onToggleExpand,
}: {
  content: string
  expanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <>
      <div
        className={cn(
          'text-foreground/90 mt-1 cursor-pointer text-sm leading-snug whitespace-pre-wrap break-words',
          expanded ? '' : 'line-clamp-3',
        )}
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          onThoughtKeyDown(e, onToggleExpand)
        }}
      >
        {content}
      </div>
      <p className="text-muted-foreground mt-1 text-[10px]">
        {expanded ? 'Click to collapse' : 'Click to expand'}
      </p>
    </>
  )
}

function StaticBody({ children }: { children: ReactNode }) {
  return (
    <div className="text-foreground/90 mt-1 text-sm leading-snug whitespace-pre-wrap break-words">
      {children}
    </div>
  )
}

function ObservationConfBadge({ score01 }: { score01: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, score01 * 100)))
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        confidenceBadgeClass(pct),
      )}
    >
      {String(pct)}% conf
    </span>
  )
}

function TraceStepCard({ trace, expanded, onToggleExpand }: TraceStepCardProps) {
  const Icon = stepIcon(trace.step)
  const shell = cn(CARD_BASE, stepAccentClass(trace.step))
  const label = stepLabel(trace.step)
  const conf = trace.confidenceScore

  return (
    <article className={shell}>
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {label}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">{formatStepTime(trace.timestamp)}</span>
            {trace.step === 'action' ? (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {trace.taskType}
              </Badge>
            ) : null}
            {trace.step === 'observation' && conf !== undefined ? <ObservationConfBadge score01={conf} /> : null}
          </div>
          {trace.step === 'thought' ? (
            <ThoughtBody content={trace.content} expanded={expanded} onToggleExpand={onToggleExpand} />
          ) : (
            <StaticBody>{trace.content}</StaticBody>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Live ReAct trace timeline (Thought → Action → Observation), chronological with step-type styling.
 * @see ReTrace-style sequential layout (arXiv 2511.11187).
 */
export function ReasoningTrace({ traces, maxVisible = 15 }: ReasoningTraceProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set())

  const cap = Math.max(1, maxVisible)
  const visible = traces.length <= cap ? traces : traces.slice(traces.length - cap)

  useEffect(() => {
    const el = scrollRef.current
    if (el === null) {
      return
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [traces.length])

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const live = traces.length > 0

  return (
    <section className="flex flex-col gap-3" aria-label="ReAct reasoning trace">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Reasoning Trace</h2>
        {live ? (
          <span className="relative flex h-2.5 w-2.5" aria-label="Live updates">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-[480px] flex-col gap-3 overflow-y-auto scroll-smooth pr-1"
      >
        {visible.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No reasoning trace yet — send Jarvis a task to begin
          </p>
        ) : (
          visible.map((trace) => {
            const key = traceRowKey(trace)
            return (
              <TraceStepCard
                key={key}
                trace={trace}
                expanded={expandedKeys.has(key)}
                onToggleExpand={() => {
                  toggleExpand(key)
                }}
              />
            )
          })
        )}
      </div>
    </section>
  )
}

export default ReasoningTrace
