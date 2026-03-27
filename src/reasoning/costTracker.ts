/**
 * Per-session LLM spend tracking, budget checks, and warning telemetry.
 *
 * @module reasoning/costTracker
 */

import { v4 as uuidv4 } from 'uuid'

import { telemetry } from '@/lib/observability/telemetryCollector'

import type { ModelTier } from './modelRegistry'
import { MODEL_REGISTRY, estimateCost } from './modelRegistry'

const LOG = '[CostTracker]'

const TURNS_PER_DAY_ESTIMATE = 50
const DAYS_PER_MONTH_ESTIMATE = 30

/** One billed API call attributed to a session. */
export interface CostRecord {
  id: string
  sessionId: string
  tier: ModelTier
  model: string
  actualInputTokens: number
  actualOutputTokens: number
  actualCostUSD: number
  taskType: string
  timestamp: string
}

/** Aggregated spend for a single session. */
export interface SessionCostSummary {
  sessionId: string
  totalCostUSD: number
  byTier: Record<
    ModelTier,
    {
      calls: number
      costUSD: number
      inputTokens: number
      outputTokens: number
    }
  >
  premiumCallCount: number
  reasoningCallCount: number
  /** Rough monthly projection: `(totalCost / calls) * 50 * 30` using this session’s call count. */
  estimatedMonthlyCostUSD: number
}

/** Default soft caps for logging / routing (not hard enforcement here). */
export const DEFAULT_BUDGET = {
  MAX_SESSION_COST_USD: 2.0,
  MAX_PREMIUM_COST_USD: 1.0,
  WARN_THRESHOLD_USD: 1.5,
} as const

function emptyTierBucket(): SessionCostSummary['byTier'][ModelTier] {
  return { calls: 0, costUSD: 0, inputTokens: 0, outputTokens: 0 }
}

function emptyByTier(): SessionCostSummary['byTier'] {
  return {
    nano: emptyTierBucket(),
    standard: emptyTierBucket(),
    reasoning: emptyTierBucket(),
    premium: emptyTierBucket(),
  }
}

function emptyByTierSystem(): Record<ModelTier, { calls: number; costUSD: number }> {
  return {
    nano: { calls: 0, costUSD: 0 },
    standard: { calls: 0, costUSD: 0 },
    reasoning: { calls: 0, costUSD: 0 },
    premium: { calls: 0, costUSD: 0 },
  }
}

/**
 * In-memory cost ledger keyed by session.
 */
export default class CostTracker {
  private readonly records = new Map<string, CostRecord[]>()
  /** Sessions that have already emitted {@link TelemetryEventType} `cost_warning` after crossing the warn threshold. */
  private readonly warnedSessions = new Set<string>()

  /**
   * Records actual token usage, updates aggregates, and may emit a one-time cost warning per session.
   */
  record(
    sessionId: string,
    tier: ModelTier,
    model: string,
    actualInputTokens: number,
    actualOutputTokens: number,
    taskType: string,
  ): CostRecord {
    void MODEL_REGISTRY[tier]
    const actualCostUSD = estimateCost(tier, actualInputTokens, actualOutputTokens)
    const beforeTotal = this.getSessionTotalUSD(sessionId)

    const row: CostRecord = {
      id: uuidv4(),
      sessionId,
      tier,
      model,
      actualInputTokens,
      actualOutputTokens,
      actualCostUSD,
      taskType,
      timestamp: new Date().toISOString(),
    }

    const list = this.records.get(sessionId) ?? []
    list.push(row)
    this.records.set(sessionId, list)

    const summary = this.getSessionSummary(sessionId)

    if (
      summary.totalCostUSD >= DEFAULT_BUDGET.WARN_THRESHOLD_USD &&
      beforeTotal < DEFAULT_BUDGET.WARN_THRESHOLD_USD &&
      !this.warnedSessions.has(sessionId)
    ) {
      this.warnedSessions.add(sessionId)
      telemetry.record('cost_warning', sessionId, {
        totalCostUSD: summary.totalCostUSD,
        threshold: DEFAULT_BUDGET.WARN_THRESHOLD_USD,
        tier,
      })
      console.warn(`${LOG} ⚠ Session ${sessionId} cost: ${summary.totalCostUSD.toFixed(4)}`)
    }

    return row
  }

  private getSessionTotalUSD(sessionId: string): number {
    const rows = this.records.get(sessionId) ?? []
    return rows.reduce((s, r) => s + r.actualCostUSD, 0)
  }

  /** Full rollup for one session (empty tiers zeroed). */
  getSessionSummary(sessionId: string): SessionCostSummary {
    const rows = this.records.get(sessionId) ?? []
    const byTier = emptyByTier()
    let totalCostUSD = 0
    let premiumCallCount = 0
    let reasoningCallCount = 0

    for (const r of rows) {
      totalCostUSD += r.actualCostUSD
      const b = byTier[r.tier]
      b.calls++
      b.costUSD += r.actualCostUSD
      b.inputTokens += r.actualInputTokens
      b.outputTokens += r.actualOutputTokens
      if (r.tier === 'premium') premiumCallCount++
      if (r.tier === 'reasoning') reasoningCallCount++
    }

    const n = rows.length
    const estimatedMonthlyCostUSD =
      n > 0 ? (totalCostUSD / n) * TURNS_PER_DAY_ESTIMATE * DAYS_PER_MONTH_ESTIMATE : 0

    return {
      sessionId,
      totalCostUSD,
      byTier,
      premiumCallCount,
      reasoningCallCount,
      estimatedMonthlyCostUSD,
    }
  }

  /** Number of `premium` tier records in the session. */
  getPremiumCallCount(sessionId: string): number {
    return this.getSessionSummary(sessionId).premiumCallCount
  }

  /** Number of `reasoning` tier records in the session. */
  getReasoningCallCount(sessionId: string): number {
    return this.getSessionSummary(sessionId).reasoningCallCount
  }

  /** True when total session spend meets or exceeds {@link DEFAULT_BUDGET.MAX_SESSION_COST_USD}. */
  isOverBudget(sessionId: string): boolean {
    return this.getSessionSummary(sessionId).totalCostUSD >= DEFAULT_BUDGET.MAX_SESSION_COST_USD
  }

  /** True when premium-tier spend alone meets or exceeds {@link DEFAULT_BUDGET.MAX_PREMIUM_COST_USD}. */
  isPremiumCapReached(sessionId: string): boolean {
    const premiumUSD = this.getSessionSummary(sessionId).byTier.premium.costUSD
    return premiumUSD >= DEFAULT_BUDGET.MAX_PREMIUM_COST_USD
  }

  /** Cross-session totals for dashboards. */
  getSystemCostStats(): {
    totalSessions: number
    totalCostUSD: number
    byTier: Record<ModelTier, { calls: number; costUSD: number }>
    avgCostPerSession: number
    estimatedMonthlyCostUSD: number
  } {
    const byTier = emptyByTierSystem()
    let totalCostUSD = 0
    let totalCalls = 0

    for (const [, rows] of this.records) {
      for (const r of rows) {
        totalCostUSD += r.actualCostUSD
        totalCalls++
        byTier[r.tier].calls++
        byTier[r.tier].costUSD += r.actualCostUSD
      }
    }

    const totalSessions = this.records.size
    const avgCostPerSession = totalSessions > 0 ? totalCostUSD / totalSessions : 0
    const estimatedMonthlyCostUSD =
      totalCalls > 0
        ? (totalCostUSD / totalCalls) * TURNS_PER_DAY_ESTIMATE * DAYS_PER_MONTH_ESTIMATE
        : 0

    return {
      totalSessions,
      totalCostUSD,
      byTier,
      avgCostPerSession,
      estimatedMonthlyCostUSD,
    }
  }

  /** Drops all {@link CostRecord}s and warning state for a session. */
  clearSession(sessionId: string): void {
    this.records.delete(sessionId)
    this.warnedSessions.delete(sessionId)
  }
}

/** Process-wide {@link CostTracker} singleton. */
export const costTracker = new CostTracker()
