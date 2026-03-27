'use client'

import { formatDistanceToNow } from 'date-fns'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface KpiHeaderProps {
  isConnected: boolean
  totalCostUSD: number
  avgCritiqueScore: number
  avgConfidence: number
  routedCallsCount: number
  uarTriggerCount: number
  confidenceTrend: 'improving' | 'stable' | 'degrading'
  confidenceHistory: Array<{ scalar: number; timestamp: string }>
  /**
   * ISO timestamp from SSE heartbeat; shown as relative time on the connection card.
   * Omit when unknown.
   */
  lastHeartbeat?: string | null
  /**
   * Critique scores in chronological order (newest last). When at least two values exist,
   * drives the Reflexion {@link CritiqueDeltaBadge} direction.
   */
  recentCritiqueScores?: readonly number[]
  /** Count of pre-task estimates with `shouldProceed === false` (live SSE). */
  preTaskBlockedCount: number
  /** Rolling mean of pre-task confidence (0–1). */
  avgPreTaskConfidence: number
}

function formatHeartbeatRelative(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.length === 0) {
    return '—'
  }
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) {
    return '—'
  }
  return formatDistanceToNow(t, { addSuffix: true })
}

function costTone(usd: number): string {
  if (usd < 0.5) return 'text-emerald-600 dark:text-emerald-400'
  if (usd <= 1.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function confidencePctTone(pct: number): string {
  if (pct >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function uarTone(count: number): string {
  if (count === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (count <= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function preTaskBlockStripClass(blockedCount: number): string {
  const base =
    'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums'
  if (blockedCount > 0) {
    return cn(
      base,
      'border-red-500/50 bg-red-950/50 text-red-200 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100',
    )
  }
  return cn(
    base,
    'border-gray-600 bg-gray-800/70 text-gray-400 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-400',
  )
}

/** Display percent (0–100) from rolling mean 0–1. */
function preTaskAvgConfidenceClass(pct: number): string {
  if (pct >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function connectionTone(connected: boolean): string {
  return connected
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400'
}

function trendLabel(trend: KpiHeaderProps['confidenceTrend']): string {
  switch (trend) {
    case 'improving':
      return 'Improving ↑'
    case 'degrading':
      return 'Degrading ↓'
    default:
      return 'Stable →'
  }
}

type DeltaKind = 'increase' | 'decrease' | 'unchanged'

function critiqueDeltaKind(scores: readonly number[] | undefined): DeltaKind {
  if (scores === undefined || scores.length < 2) {
    return 'unchanged'
  }
  const prev = scores[scores.length - 2]!
  const last = scores[scores.length - 1]!
  if (last > prev + 0.02) return 'increase'
  if (last < prev - 0.02) return 'decrease'
  return 'unchanged'
}

function CritiqueDeltaBadge({ kind }: { kind: DeltaKind }) {
  const base =
    'inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums'

  if (kind === 'increase') {
    return (
      <span className={cn(base, 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300')}>
        <TrendingUp className="size-3.5" aria-hidden />
        Up
      </span>
    )
  }
  if (kind === 'decrease') {
    return (
      <span className={cn(base, 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300')}>
        <TrendingDown className="size-3.5" aria-hidden />
        Down
      </span>
    )
  }
  return (
    <span className={cn(base, 'border-border bg-muted/50 text-muted-foreground')}>
      <Minus className="size-3.5" aria-hidden />
      Flat
    </span>
  )
}

function ConfidenceSpark({
  values,
  accentPct,
}: {
  values: readonly { value: number }[]
  accentPct: number
}) {
  if (values.length === 0) {
    return <div className="text-muted-foreground h-12 text-xs">No samples</div>
  }

  return (
    <div className={cn('h-12 w-full', confidencePctTone(accentPct))}>
      <ResponsiveContainer width="100%" height="100%">
        {/* NOTE: Spec referred to this as "SparkAreaChart" — there is no
            component by that name. This uses Recharts AreaChart with
            minimal props (no axes, no tooltip) to achieve the same
            sparkline visual. If Tremor's <AreaChart> is available,
            it can replace this with identical visual output. */}
        <AreaChart data={[...values]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            fill="currentColor"
            fillOpacity={0.15}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Top-row KPI strip for the Jarvis dashboard: connection, cost, Reflexion, confidence spark, routing, UAR.
 */
export function KpiHeader({
  isConnected,
  totalCostUSD,
  avgCritiqueScore,
  avgConfidence,
  routedCallsCount,
  uarTriggerCount,
  confidenceTrend,
  confidenceHistory,
  lastHeartbeat = null,
  recentCritiqueScores,
  preTaskBlockedCount,
  avgPreTaskConfidence,
}: KpiHeaderProps) {
  let heartbeatSub = 'Stream reconnecting'
  if (isConnected) {
    if (lastHeartbeat !== null && lastHeartbeat.length > 0) {
      heartbeatSub = formatHeartbeatRelative(lastHeartbeat)
    } else {
      heartbeatSub = 'Waiting for heartbeat…'
    }
  }

  const critiquePct = (avgCritiqueScore * 100).toFixed(0)
  const confPct = Math.round(Math.min(100, Math.max(0, avgConfidence * 100)))
  const sparkData = confidenceHistory
    .slice(-10)
    .map((p) => ({ value: p.scalar * 100 }))

  const deltaKind = critiqueDeltaKind(recentCritiqueScores)

  const preTaskPct = Math.min(100, Math.max(0, avgPreTaskConfidence * 100))

  return (
    <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Card className="py-4 shadow-sm">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-sm font-medium">Jarvis Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pt-0">
          <p className={cn('text-2xl font-semibold tracking-tight', connectionTone(isConnected))}>
            {isConnected ? 'Live' : 'Reconnecting…'}
          </p>
          <p className="text-muted-foreground text-xs">{heartbeatSub}</p>
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-sm font-medium">Session Cost</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pt-0">
          <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', costTone(totalCostUSD))}>
            ${totalCostUSD.toFixed(4)}
          </p>
          <p className="text-muted-foreground text-xs">Estimated API spend</p>
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-4 pb-2">
          <CardTitle className="text-sm font-medium">Reflexion Quality</CardTitle>
          <CritiqueDeltaBadge kind={deltaKind} />
        </CardHeader>
        <CardContent className="space-y-1 px-4 pt-0">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{critiquePct}%</p>
          <p className="text-muted-foreground text-xs">Avg critique score</p>
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pt-0">
          <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', confidencePctTone(confPct))}>
            {confPct}%
          </p>
          <p className="text-muted-foreground text-xs">{trendLabel(confidenceTrend)}</p>
          <ConfidenceSpark values={sparkData} accentPct={confPct} />
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-sm font-medium">Routed Calls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pt-0">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{routedCallsCount.toString()}</p>
          <p className="text-muted-foreground text-xs">Across all tiers</p>
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-sm font-medium">UAR Triggers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pt-0">
          <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', uarTone(uarTriggerCount))}>
            {uarTriggerCount.toString()}
          </p>
          <p className="text-muted-foreground text-xs">Uncertainty resolved</p>
        </CardContent>
      </Card>
    </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-700/40 pt-3 dark:border-gray-700/50">
        <span className={preTaskBlockStripClass(preTaskBlockedCount)}>
          Pre-Task Blocks: {preTaskBlockedCount.toString()}
        </span>
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            preTaskAvgConfidenceClass(preTaskPct),
          )}
        >
          Avg Pre-Task Confidence: {(avgPreTaskConfidence * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

export default KpiHeader
