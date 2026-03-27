'use client'

import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import type { ReflexionEvent } from '@/hooks/useJarvisTelemetry'

export interface ReflexionTimelineProps {
  events: ReflexionEvent[]
  avgCritiqueScore: number
}

const MAX_SESSION_ROWS = 10
const MIN_ITER_COLS = 3

function scoreCellStyles(score: number): string {
  if (score >= 0.8) {
    return 'border-emerald-400 bg-emerald-100 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100'
  }
  if (score >= 0.6) {
    return 'border-blue-400 bg-blue-100 text-blue-950 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-100'
  }
  if (score >= 0.4) {
    return 'border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100'
  }
  return 'border-red-400 bg-red-100 text-red-950 dark:border-red-600 dark:bg-red-950/40 dark:text-red-100'
}

function dedupeByIteration(evs: ReflexionEvent[]): Map<number, ReflexionEvent> {
  const byIter = new Map<number, ReflexionEvent>()
  const sorted = [...evs].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime()
    const tb = new Date(b.timestamp).getTime()
    return ta - tb
  })
  for (const e of sorted) {
    byIter.set(e.iteration, e)
  }
  return byIter
}

function groupBySession(events: ReflexionEvent[]): Map<string, ReflexionEvent[]> {
  const m = new Map<string, ReflexionEvent[]>()
  for (const e of events) {
    const list = m.get(e.sessionId) ?? []
    list.push(e)
    m.set(e.sessionId, list)
  }
  return m
}

function sessionLastActivityTs(evs: ReflexionEvent[]): number {
  let max = 0
  for (const e of evs) {
    const t = new Date(e.timestamp).getTime()
    if (!Number.isNaN(t) && t > max) max = t
  }
  return max
}

function passRatePercent(events: ReflexionEvent[]): number {
  if (events.length === 0) return 0
  const n = events.filter((e) => e.passed).length
  return (n / events.length) * 100
}

function avgIterationsToPass(events: ReflexionEvent[]): number | null {
  const bySession = groupBySession(events)
  const values: number[] = []
  for (const evs of bySession.values()) {
    const map = dedupeByIteration(evs)
    let firstPassIter: number | null = null
    const iters = [...map.keys()].sort((a, b) => a - b)
    for (const it of iters) {
      const row = map.get(it)
      if (row?.passed === true) {
        firstPassIter = it
        break
      }
    }
    if (firstPassIter !== null) {
      values.push(firstPassIter)
    }
  }
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function shortSessionLabel(id: string): string {
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

interface SessionRowModel {
  sessionId: string
  taskType: string
  byIteration: Map<number, ReflexionEvent>
}

/**
 * Horizontal swimlane of Reflexion critiques: one row per session, columns = retry iterations.
 */
export function ReflexionTimeline({ events, avgCritiqueScore }: ReflexionTimelineProps) {
  const { sessionRows, iterCount } = useMemo(() => {
    const grouped = groupBySession(events)
    const entries = [...grouped.entries()].map(([sessionId, evs]) => ({
      sessionId,
      evs,
      lastTs: sessionLastActivityTs(evs),
    }))
    entries.sort((a, b) => b.lastTs - a.lastTs)
    const top = entries.slice(0, MAX_SESSION_ROWS)

    let maxIter = MIN_ITER_COLS
    const rows: SessionRowModel[] = top.map(({ sessionId, evs }) => {
      const byIteration = dedupeByIteration(evs)
      for (const it of byIteration.keys()) {
        if (it > maxIter) maxIter = it
      }
      const lastTask = [...evs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0]
      const taskType = lastTask?.taskType ?? '—'
      return { sessionId, taskType, byIteration }
    })

    return { sessionRows: rows, iterCount: Math.max(MIN_ITER_COLS, maxIter) }
  }, [events])

  const passRate = useMemo(() => passRatePercent(events), [events])
  const avgIterPass = useMemo(() => avgIterationsToPass(events), [events])

  if (events.length === 0) {
    return (
      <section className="py-10 text-center" aria-label="Reflexion timeline">
        <p className="text-muted-foreground text-sm">
          No Reflexion events yet — critique events will appear as Jarvis processes tasks
        </p>
      </section>
    )
  }

  const iterationIndices = Array.from({ length: iterCount }, (_, i) => i + 1)

  return (
    <section className="space-y-4" aria-label="Reflexion timeline">
      <h2 className="text-lg font-semibold tracking-tight">Reflexion timeline</h2>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-max space-y-2">
          <div className="text-muted-foreground flex items-stretch gap-2 text-[10px] font-medium uppercase tracking-wide">
            <div className="flex w-[140px] shrink-0 items-end px-1 pb-1">Session</div>
            <div className="flex gap-1">
              {iterationIndices.map((n) => (
                <div
                  key={n}
                  className="flex w-16 shrink-0 items-end justify-center pb-1 text-center"
                >
                  Iter {n}
                </div>
              ))}
            </div>
          </div>

          {sessionRows.map((row) => (
            <div key={row.sessionId} className="flex items-stretch gap-2">
              <div
                className="border-border flex w-[140px] shrink-0 flex-col justify-center border-b border-dashed pb-2"
                title={row.sessionId}
              >
                <span className="truncate text-xs font-medium">{shortSessionLabel(row.sessionId)}</span>
                <span className="text-muted-foreground truncate text-[10px]">{row.taskType}</span>
              </div>
              <div className="flex gap-1">
                {iterationIndices.map((iterNum) => {
                  const cell = row.byIteration.get(iterNum)
                  if (cell === undefined) {
                    return (
                      <div
                        key={iterNum}
                        className="border-muted-foreground/25 bg-muted/20 flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-md border border-dashed"
                      />
                    )
                  }
                  const showStar = cell.passed === true && iterNum === 1
                  return (
                    <div
                      key={iterNum}
                      className={cn(
                        'relative flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-md border-2 text-center',
                        scoreCellStyles(cell.critiqueScore),
                      )}
                      title={`${cell.taskType} @ ${cell.timestamp}`}
                    >
                      {showStar ? (
                        <span
                          className="absolute top-0.5 right-0.5 text-[10px] leading-none text-amber-600 opacity-60 dark:text-amber-400"
                          aria-label="Passed on first iteration"
                        >
                          ★
                        </span>
                      ) : null}
                      <span className="text-xs font-semibold tabular-nums">
                        {(cell.critiqueScore * 100).toFixed(0)}%
                      </span>
                      <span
                        className={cn(
                          'text-[9px] font-bold tracking-wide',
                          cell.passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
                        )}
                      >
                        {cell.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground border-t pt-3 text-xs">
        <span className="tabular-nums">Avg critique score: {(avgCritiqueScore * 100).toFixed(0)}%</span>
        <span className="text-muted-foreground/40 mx-2">|</span>
        <span className="tabular-nums">Pass rate: {passRate.toFixed(0)}%</span>
        <span className="text-muted-foreground/40 mx-2">|</span>
        <span className="tabular-nums">
          Avg iterations to pass:{' '}
          {avgIterPass === null ? '—' : avgIterPass.toFixed(1)}
        </span>
      </div>
    </section>
  )
}

export default ReflexionTimeline
