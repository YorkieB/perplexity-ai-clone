'use client'

import { type ReactNode, useId, useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ConfidencePoint } from '@/hooks/useJarvisTelemetry'

export interface ConfidenceTimelineProps {
  history: ConfidencePoint[]
  uarTriggerCount: number
}

const LEVEL_ORDER = ['very_high', 'high', 'moderate', 'low', 'very_low'] as const

type LevelKey = (typeof LEVEL_ORDER)[number]

type TrendDirection = 'improving' | 'stable' | 'degrading'

const LEVEL_COLORS: Record<LevelKey, string> = {
  very_high: '#10b981',
  high: '#3b82f6',
  moderate: '#fbbf24',
  low: '#fb923c',
  very_low: '#ef4444',
}

interface ChartRow {
  index: number
  confidence: number
  timestamp: string
  level: string
  action: string
  taskType: string
  rawTimestamp: string
}

function deriveTrend(history: ConfidencePoint[]): TrendDirection {
  if (history.length < 4) {
    return 'stable'
  }
  const mid = Math.floor(history.length / 2)
  const firstAvg = history.slice(0, mid).reduce((s, p) => s + p.scalar, 0) / mid
  const secondAvg =
    history.slice(mid).reduce((s, p) => s + p.scalar, 0) / (history.length - mid)
  const delta = secondAvg - firstAvg
  if (delta > 0.03) return 'improving'
  if (delta < -0.03) return 'degrading'
  return 'stable'
}

function trendBadgeLabel(trend: TrendDirection): string {
  if (trend === 'improving') return 'Improving ↑'
  if (trend === 'degrading') return 'Degrading ↓'
  return 'Stable →'
}

function trendBadgeClass(trend: TrendDirection): string {
  if (trend === 'improving') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
  if (trend === 'degrading') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
  }
  return 'border-border bg-muted text-muted-foreground'
}

function countByLevel(history: ConfidencePoint[]): Record<LevelKey, number> {
  const counts: Record<LevelKey, number> = {
    very_high: 0,
    high: 0,
    moderate: 0,
    low: 0,
    very_low: 0,
  }
  for (const p of history) {
    const k = p.level as LevelKey
    if (k in counts) {
      counts[k]++
    }
  }
  return counts
}

function LevelDistributionBar({ history }: { history: ConfidencePoint[] }) {
  const counts = useMemo(() => countByLevel(history), [history])
  const total = history.length
  if (total === 0) {
    return null
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-muted-foreground text-xs font-medium">Level distribution</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {LEVEL_ORDER.map((level) => {
          const n = counts[level]
          if (n === 0) return null
          const pct = (n / total) * 100
          return (
            <div
              key={level}
              className="h-full min-w-px transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: LEVEL_COLORS[level],
              }}
              title={`${level}: ${String(n)}`}
            />
          )
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {LEVEL_ORDER.map((level) => (
          <span key={level} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ backgroundColor: LEVEL_COLORS[level] }} />
            {level.replace(/_/g, ' ')} ({String(counts[level])})
          </span>
        ))}
      </div>
    </div>
  )
}

interface ConfidenceTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ChartRow }>
}

function ConfidenceTooltip({ active, payload }: ConfidenceTooltipProps) {
  if (active !== true || payload === undefined || payload.length === 0) {
    return null
  }
  const row = payload[0]?.payload
  if (row === undefined) {
    return null
  }

  return (
    <div className="border-border bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="text-foreground font-semibold tabular-nums">{row.confidence}% confidence</p>
      <p className="text-muted-foreground mt-1">
        <span className="font-medium text-foreground">Level:</span> {row.level.replace(/_/g, ' ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Action:</span> {row.action}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Task:</span> {row.taskType}
      </p>
      <p className="text-muted-foreground mt-1 text-[10px] opacity-90">{row.rawTimestamp}</p>
    </div>
  )
}

function renderConfidenceDot(props: {
  cx?: number
  cy?: number
  payload?: ChartRow
}): ReactNode {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined || payload === undefined) {
    return null
  }

  const { action } = payload

  if (action === 'trigger_uar' || action === 'escalate_model') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={7}
        fill="#ef4444"
        stroke="#fecaca"
        strokeWidth={2}
        className="drop-shadow-sm"
      />
    )
  }

  if (action === 'request_clarification') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <line x1={-5} y1={-5} x2={5} y2={5} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
        <line x1={5} y1={-5} x2={-5} y2={5} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
      </g>
    )
  }

  return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" stroke="#fff" strokeWidth={1} />
}

/**
 * Live confidence trajectory with policy reference bands and UAR / clarification markers.
 */
export function ConfidenceTimeline({ history, uarTriggerCount }: ConfidenceTimelineProps) {
  const gradientId = useId().replace(/:/g, '')

  const chartData: ChartRow[] = useMemo(
    () =>
      history.map((p, i) => ({
        index: i,
        confidence: Math.round(p.scalar * 100),
        timestamp: new Date(p.timestamp).toLocaleTimeString(),
        level: p.level,
        action: p.action,
        taskType: p.taskType,
        rawTimestamp: p.timestamp,
      })),
    [history],
  )

  const trend = useMemo(() => deriveTrend(history), [history])

  const xTicks = useMemo(
    () => chartData.map((d) => d.index).filter((i) => i % 5 === 0),
    [chartData],
  )

  if (history.length === 0) {
    return (
      <section className="py-10 text-center" aria-label="Confidence timeline">
        <p className="text-muted-foreground text-sm">No confidence scores yet</p>
      </section>
    )
  }

  return (
    <section className="space-y-3" aria-label="Confidence timeline">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Confidence Timeline</h2>
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
            trendBadgeClass(trend),
          )}
        >
          {trendBadgeLabel(trend)}
        </span>
        <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
          UAR events: {uarTriggerCount}
        </Badge>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis
            dataKey="index"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={xTicks}
            tickFormatter={(i: number) => {
              const row = chartData[i]
              return row !== undefined ? row.timestamp : ''
            }}
            tick={{ fontSize: 10, fill: '#737373' }}
            height={28}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#737373' }}
            width={48}
            label={{
              value: 'Confidence %',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10, fill: '#737373' },
            }}
          />
          <Tooltip content={<ConfidenceTooltip />} />
          <ReferenceLine
            y={90}
            stroke="#10b981"
            strokeDasharray="4 2"
            label={{ value: 'Commit', fill: '#10b981', fontSize: 10, position: 'insideTopLeft' }}
          />
          <ReferenceLine
            y={75}
            stroke="#fbbf24"
            strokeDasharray="4 2"
            label={{ value: 'Flag', fill: '#d97706', fontSize: 10, position: 'insideTopLeft' }}
          />
          <ReferenceLine
            y={65}
            stroke="#f97316"
            strokeDasharray="4 2"
            label={{ value: 'UAR', fill: '#ea580c', fontSize: 10, position: 'insideTopLeft' }}
          />
          <ReferenceLine
            y={30}
            stroke="#ef4444"
            strokeDasharray="4 2"
            label={{ value: 'Block', fill: '#ef4444', fontSize: 10, position: 'insideBottomLeft' }}
          />
          <Area
            type="monotone"
            dataKey="confidence"
            stroke="#3b82f6"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={renderConfidenceDot}
            activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 1 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <LevelDistributionBar history={history} />
    </section>
  )
}

export default ConfidenceTimeline
