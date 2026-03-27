'use client'

import { format, parseISO } from 'date-fns'
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Pause,
  Play,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ReActTraceEntry } from '@/hooks/useJarvisTelemetry'

export interface ReasoningReplayProps {
  traces: ReActTraceEntry[]
}

/** Optional fields callers may attach for richer replay (not on base {@link ReActTraceEntry}). */
export type ReplayTraceEntry = ReActTraceEntry & {
  uncertaintyFactors?: readonly string[]
}

const PLAYBACK_MS = [1000, 500, 250] as const
type PlaybackSpeed = (typeof PLAYBACK_MS)[number]

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
  'relative rounded-lg border border-border/60 pl-4 pr-3 py-3 shadow-sm transition-shadow'

function formatStepTime(iso: string): string {
  try {
    return format(parseISO(iso), 'HH:mm:ss.SSS')
  } catch {
    return iso
  }
}

function formatTimestampFull(iso: string): string {
  try {
    return format(parseISO(iso), 'PPpp')
  } catch {
    return iso
  }
}

function readUncertaintyFactors(t: ReActTraceEntry): string[] {
  const x = t as ReplayTraceEntry
  const u = x.uncertaintyFactors
  if (!Array.isArray(u)) return []
  return u.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
}

function uniqueSessionIdsOrdered(traces: ReActTraceEntry[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of traces) {
    if (!seen.has(t.sessionId)) {
      seen.add(t.sessionId)
      out.push(t.sessionId)
    }
  }
  return out
}

interface ReplayStepCardProps {
  trace: ReActTraceEntry
  isCurrent: boolean
}

function ReplayStepCard({ trace, isCurrent }: ReplayStepCardProps) {
  const Icon = stepIcon(trace.step)
  const shell = cn(
    CARD_BASE,
    stepAccentClass(trace.step),
    isCurrent ? 'ring-2 ring-blue-400 animate-pulse' : 'opacity-100',
  )
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
            {conf !== undefined ? (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {(conf * 100).toFixed(0)}% conf
              </span>
            ) : null}
          </div>
          <div className="text-foreground/90 mt-1 line-clamp-4 text-sm leading-snug whitespace-pre-wrap break-words">
            {trace.content}
          </div>
        </div>
      </div>
    </article>
  )
}

function speedLabel(ms: PlaybackSpeed): string {
  if (ms === 1000) return '1×'
  if (ms === 500) return '2×'
  return '4×'
}

/**
 * Step-through debugger view for a ReAct trace: playback controls, session filter, and detail sidebar.
 */
export function ReasoningReplay({ traces }: ReasoningReplayProps) {
  const sessionIds = useMemo(() => uniqueSessionIdsOrdered(traces), [traces])
  const multiSession = sessionIds.length > 1

  const [selectedSessionId, setSelectedSessionId] = useState<string>(() => sessionIds[0] ?? '')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1000)

  useEffect(() => {
    if (sessionIds.length === 0) {
      return
    }
    if (!sessionIds.includes(selectedSessionId)) {
      setSelectedSessionId(sessionIds[0]!)
    }
  }, [sessionIds, selectedSessionId])

  const activeTraces = useMemo(() => {
    if (sessionIds.length === 0) return []
    if (!multiSession) return traces
    return traces.filter((t) => t.sessionId === selectedSessionId)
  }, [traces, sessionIds.length, multiSession, selectedSessionId])

  useEffect(() => {
    setCurrentIndex(0)
    setIsPlaying(false)
  }, [selectedSessionId, activeTraces.length])

  useEffect(() => {
    if (!isPlaying || activeTraces.length === 0) {
      return
    }
    if (currentIndex >= activeTraces.length - 1) {
      setIsPlaying(false)
      return
    }
    const t = window.setTimeout(() => {
      setCurrentIndex((i) => i + 1)
    }, playbackSpeed)
    return () => {
      window.clearTimeout(t)
    }
  }, [isPlaying, playbackSpeed, currentIndex, activeTraces.length])

  const goFirst = useCallback(() => {
    setIsPlaying(false)
    setCurrentIndex(0)
  }, [])

  const goPrev = useCallback(() => {
    setIsPlaying(false)
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIsPlaying(false)
    setCurrentIndex((i) => Math.min(activeTraces.length - 1, i + 1))
  }, [activeTraces.length])

  const goLast = useCallback(() => {
    setIsPlaying(false)
    setCurrentIndex(Math.max(0, activeTraces.length - 1))
  }, [activeTraces.length])

  const togglePlay = useCallback(() => {
    if (activeTraces.length === 0) return
    if (currentIndex >= activeTraces.length - 1) {
      setCurrentIndex(0)
      setIsPlaying(true)
      return
    }
    setIsPlaying((p) => !p)
  }, [activeTraces.length, currentIndex])

  const visible = activeTraces.slice(0, currentIndex + 1)
  const current = activeTraces[currentIndex]
  const factors = current !== undefined ? readUncertaintyFactors(current) : []

  const disabled = activeTraces.length === 0

  if (traces.length === 0) {
    return (
      <section className="py-10 text-center" aria-label="Reasoning replay">
        <p className="text-muted-foreground text-sm">No trace loaded — connect live telemetry or load a session.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4" aria-label="Reasoning replay">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Reasoning replay</h2>
        {multiSession ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Session</span>
            <Select
              value={selectedSessionId || sessionIds[0]}
              onValueChange={(v) => {
                setSelectedSessionId(v)
              }}
            >
              <SelectTrigger className="h-9 w-[min(100vw-2rem,280px)] sm:w-[280px]" size="sm">
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                {sessionIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id.length > 28 ? `${id.slice(0, 24)}…` : id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="First step"
            onClick={goFirst}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || currentIndex <= 0}
            aria-label="Previous step"
            onClick={goPrev}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon"
            disabled={disabled}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || currentIndex >= activeTraces.length - 1}
            aria-label="Next step"
            onClick={goNext}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="Last step"
            onClick={goLast}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>

        <div className="border-border flex flex-wrap items-center gap-2 border-l pl-3">
          <span className="text-muted-foreground text-xs">Speed</span>
          {(PLAYBACK_MS as readonly PlaybackSpeed[]).map((ms) => (
            <Button
              key={ms}
              type="button"
              variant={playbackSpeed === ms ? 'default' : 'outline'}
              size="sm"
              className="h-8 min-w-10 px-2"
              onClick={() => {
                setPlaybackSpeed(ms)
              }}
            >
              {speedLabel(ms)}
            </Button>
          ))}
        </div>

        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          Step {disabled ? 0 : currentIndex + 1} of {activeTraces.length}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 flex max-h-[min(70vh,560px)] flex-col gap-3 overflow-y-auto pr-1">
          {visible.map((trace, i) => (
            <ReplayStepCard key={`${trace.sessionId}-${trace.timestamp}-${trace.step}-${String(i)}`} trace={trace} isCurrent={i === currentIndex} />
          ))}
        </div>

        <aside className="bg-card border-border lg:col-span-2 flex flex-col gap-4 rounded-xl border p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Current step</h3>
          {current === undefined ? (
            <p className="text-muted-foreground text-sm">No step selected</p>
          ) : (
            <>
              <Badge variant="secondary" className="w-fit capitalize">
                {stepLabel(current.step)}
              </Badge>
              <div>
                <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Content</p>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {current.content}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Task type</p>
                <p className="font-medium">{current.taskType}</p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Timestamp</p>
                <p className="font-mono text-xs">{formatTimestampFull(current.timestamp)}</p>
              </div>
              {current.confidenceScore !== undefined ? (
                <div>
                  <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Confidence</p>
                  <p className="text-3xl font-bold tabular-nums tracking-tight">
                    {(current.confidenceScore * 100).toFixed(0)}
                    <span className="text-muted-foreground text-lg font-semibold">%</span>
                  </p>
                </div>
              ) : null}
              {factors.length > 0 ? (
                <div>
                  <p className="text-muted-foreground mb-2 text-[10px] uppercase tracking-wide">
                    Uncertainty factors
                  </p>
                  <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                    {factors.map((f, idx) => (
                      <li key={`${String(idx)}-${f.slice(0, 48)}`}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

export default ReasoningReplay
