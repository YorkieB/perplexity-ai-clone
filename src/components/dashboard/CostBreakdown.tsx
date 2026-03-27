'use client'

import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MODEL_REGISTRY, type ModelTier } from '@/reasoning/modelRegistry'

export interface CostBreakdownProps {
  costByTier: Record<string, { calls: number; costUSD: number }>
  totalCostUSD: number
  routingByTier: Record<string, number>
  overrideCount: number
}

/** Session budget cap for the progress bar (USD). */
const MAX_SESSION_COST_USD = 2

const KNOWN_TIERS: readonly ModelTier[] = ['nano', 'standard', 'reasoning', 'premium'] as const

const TIER_BADGE_CLASS: Record<ModelTier, string> = {
  nano: 'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
  standard: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  reasoning: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
  premium: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
}

const TIER_PIE_FILL: Record<ModelTier, string> = {
  nano: '#9ca3af',
  standard: '#3b82f6',
  reasoning: '#8b5cf6',
  premium: '#f59e0b',
}

const OTHER_PIE_FILL = '#64748b'

function isModelTier(s: string): s is ModelTier {
  return (KNOWN_TIERS as readonly string[]).includes(s)
}

function tierBadgeClass(tier: string): string {
  if (isModelTier(tier)) {
    return TIER_BADGE_CLASS[tier]
  }
  return 'border-border bg-muted text-muted-foreground'
}

function tierPieFill(tier: string): string {
  if (isModelTier(tier)) {
    return TIER_PIE_FILL[tier]
  }
  return OTHER_PIE_FILL
}

function modelIdForTier(tier: string): string {
  if (isModelTier(tier)) {
    return MODEL_REGISTRY[tier].id
  }
  return '—'
}

function collectTierKeys(costByTier: CostBreakdownProps['costByTier']): string[] {
  const keys = new Set<string>([...KNOWN_TIERS, ...Object.keys(costByTier)])
  const ordered: string[] = []
  for (const t of KNOWN_TIERS) {
    if (keys.has(t)) {
      ordered.push(t)
      keys.delete(t)
    }
  }
  const rest = [...keys].sort()
  return [...ordered, ...rest]
}

function sumSessionCalls(
  routingByTier: CostBreakdownProps['routingByTier'],
  costByTier: CostBreakdownProps['costByTier'],
): number {
  const fromRouting = Object.values(routingByTier).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0)
  if (fromRouting > 0) {
    return fromRouting
  }
  return Object.values(costByTier).reduce((a, c) => a + (typeof c.calls === 'number' ? c.calls : 0), 0)
}

function budgetBarClass(pct: number): string {
  if (pct < 50) return 'bg-emerald-500'
  if (pct <= 75) return 'bg-amber-500'
  return 'bg-red-500'
}

interface PieRow {
  name: string
  value: number
  pct: number
}

/**
 * Session API spend by tier, donut mix, budget headroom, overrides, and a simple monthly projection.
 */
export function CostBreakdown({
  costByTier,
  totalCostUSD,
  routingByTier,
  overrideCount,
}: CostBreakdownProps) {
  const tierKeys = useMemo(() => collectTierKeys(costByTier), [costByTier])

  const rows = useMemo(() => {
    return tierKeys.map((tier) => {
      const bucket = costByTier[tier] ?? { calls: 0, costUSD: 0 }
      const callsFromRoute = routingByTier[tier]
      const calls =
        typeof callsFromRoute === 'number' && callsFromRoute > 0 ? callsFromRoute : bucket.calls
      return {
        tier,
        model: modelIdForTier(tier),
        calls,
        costUSD: typeof bucket.costUSD === 'number' ? bucket.costUSD : 0,
      }
    })
  }, [tierKeys, costByTier, routingByTier])

  const totalCalls = useMemo(() => rows.reduce((a, r) => a + r.calls, 0), [rows])

  const pieData: PieRow[] = useMemo(() => {
    const withCost = rows.filter((r) => r.costUSD > 0)
    const sum = withCost.reduce((a, r) => a + r.costUSD, 0)
    if (sum <= 0) {
      return []
    }
    return withCost.map((r) => ({
      name: r.tier,
      value: r.costUSD,
      pct: (r.costUSD / sum) * 100,
    }))
  }, [rows])

  const sessionCalls = useMemo(
    () => sumSessionCalls(routingByTier, costByTier),
    [routingByTier, costByTier],
  )

  const projectedMonthly = useMemo(() => {
    return (totalCostUSD / Math.max(sessionCalls, 1)) * 50 * 30
  }, [totalCostUSD, sessionCalls])

  const budgetPct = Math.min(100, (totalCostUSD / MAX_SESSION_COST_USD) * 100)

  const premiumCost = rows.find((r) => r.tier === 'premium')?.costUSD ?? 0

  return (
    <section className="space-y-4" aria-label="API cost breakdown">
      <h2 className="text-lg font-semibold tracking-tight">Cost breakdown</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs uppercase tracking-wide">
                <th className="pb-2 pr-3 font-medium">Tier</th>
                <th className="pb-2 pr-3 font-medium">Model</th>
                <th className="pb-2 pr-3 text-right font-medium">Calls</th>
                <th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const premiumHot = r.tier === 'premium' && r.costUSD > 0.5
                return (
                  <tr
                    key={r.tier}
                    className={cn(
                      'border-border/60 border-b last:border-0',
                      premiumHot && 'bg-red-500/10 dark:bg-red-500/15',
                    )}
                  >
                    <td className="py-2 pr-3 align-middle">
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize',
                          tierBadgeClass(r.tier),
                        )}
                      >
                        {r.tier}
                      </span>
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 align-middle font-mono text-xs">{r.model}</td>
                    <td className="py-2 pr-3 text-right align-middle tabular-nums">{r.calls}</td>
                    <td className="py-2 text-right align-middle tabular-nums">${r.costUSD.toFixed(5)}</td>
                  </tr>
                )
              })}
              <tr className="bg-muted/40 border-t font-medium">
                <td className="py-2 pr-3 align-middle">TOTAL</td>
                <td className="text-muted-foreground py-2 pr-3 align-middle">—</td>
                <td className="py-2 pr-3 text-right align-middle tabular-nums">{totalCalls}</td>
                <td className="py-2 text-right align-middle tabular-nums">${totalCostUSD.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex min-h-[260px] flex-col items-center justify-center">
          {pieData.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">No cost data by tier yet</p>
          ) : (
            <div className="relative h-[240px] w-full max-w-sm">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={tierPieFill(entry.name)} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => [`$${value.toFixed(5)}`, 'Cost']}
                    labelFormatter={(name) => `Tier: ${name}`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Session</span>
                <span className="text-foreground text-lg font-semibold tabular-nums">
                  ${totalCostUSD.toFixed(4)}
                </span>
              </div>
            </div>
          )}

          {pieData.length > 0 ? (
            <ul className="text-muted-foreground mt-3 flex w-full max-w-sm flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {pieData.map((d) => (
                <li key={d.name} className="flex items-center gap-1.5 capitalize">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: tierPieFill(d.name) }}
                  />
                  <span>{d.name}</span>
                  <span className="tabular-nums">{d.pct.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            Session Budget: ${totalCostUSD.toFixed(3)} / ${MAX_SESSION_COST_USD.toFixed(2)}
          </span>
          <span className="text-muted-foreground tabular-nums">{budgetPct.toFixed(0)}%</span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-all duration-300', budgetBarClass(budgetPct))}
            style={{ width: `${String(budgetPct)}%` }}
          />
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="border-border bg-muted/30 cursor-help rounded-md border px-3 py-2 text-xs">
            Hard routing overrides: <span className="font-semibold tabular-nums">{overrideCount}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Times routing rules overrode classifier recommendation
        </TooltipContent>
      </Tooltip>

      <p className="text-muted-foreground text-xs">
        ~${projectedMonthly.toFixed(2)}/month (projected){' '}
        <span className="opacity-80">
          — assumes 50 turns/day × 30 days at current average cost per routed call; not a forecast.
        </span>
      </p>

      {premiumCost > 0.5 ? (
        <p className="text-destructive text-xs font-medium">
          Premium tier spend exceeds $0.50 — review routing or task mix.
        </p>
      ) : null}
    </section>
  )
}

export default CostBreakdown
