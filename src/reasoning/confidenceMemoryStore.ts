/**
 * System 1 UAM — Uncertainty-Aware Memory: propagates {@link ConfidenceScore}
 * across turns, tracks rolling averages and trends, and exposes prompt context
 * for downstream {@link Thought} generation.
 *
 * @module reasoning/confidenceMemoryStore
 */

import { telemetry } from '@/lib/observability/telemetryCollector'

import type { ConfidenceScore, UncertaintyMemory, ConfidenceLevel } from './confidenceTypes'
import { CONFIDENCE_THRESHOLDS, scoreToLevel } from './confidenceTypes'

const LOG = '[ConfidenceMemory]'

/** Last three rolling-average snapshots per session (for trend detection). */
const ROLLING_AVG_HISTORY_LEN = 3

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function computeRollingAverage(entries: ConfidenceScore[]): number {
  const last = entries.slice(-5)
  if (last.length === 0) return 0
  return average(last.map((e) => e.scalar))
}

/**
 * Compares the last three rolling-average values (oldest → newest).
 */
function trendFromRollingHistory(history: number[]): UncertaintyMemory['trend'] {
  if (history.length < ROLLING_AVG_HISTORY_LEN) return 'stable'
  const a = history[history.length - 3]
  const b = history[history.length - 2]
  const c = history[history.length - 1]
  if (a === undefined || b === undefined || c === undefined) return 'stable'
  if (a < b && b < c) return 'improving'
  if (a > b && b > c) return 'degrading'
  return 'stable'
}

function dedupePreserveOrder(items: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim()
    if (t.length === 0 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

/**
 * In-session UAM ledger keyed by {@link UncertaintyMemory.sessionId}.
 */
export default class ConfidenceMemoryStore {
  private readonly memories = new Map<string, UncertaintyMemory>()
  /** Per-session sequence of rolling averages after each {@link record} call. */
  private readonly rollingAvgHistory = new Map<string, number[]>()

  /**
   * Records a score, updates rolling average / trend, emits telemetry, returns the session memory.
   */
  record(sessionId: string, score: ConfidenceScore): UncertaintyMemory {
    let memory = this.memories.get(sessionId)
    if (memory === undefined) {
      memory = {
        sessionId,
        entries: [],
        rollingAverage: 0,
        trend: 'stable',
        lastUpdatedAt: new Date().toISOString(),
      }
      this.memories.set(sessionId, memory)
      this.rollingAvgHistory.set(sessionId, [])
    }

    const level: ConfidenceLevel = scoreToLevel(score.scalar)
    const stored: ConfidenceScore = { ...score, level }
    memory.entries = [...memory.entries, stored]
    memory.rollingAverage = computeRollingAverage(memory.entries)

    const hist = [...(this.rollingAvgHistory.get(sessionId) ?? []), memory.rollingAverage].slice(
      -ROLLING_AVG_HISTORY_LEN,
    )
    this.rollingAvgHistory.set(sessionId, hist)
    memory.trend = trendFromRollingHistory(hist)
    memory.lastUpdatedAt = new Date().toISOString()

    telemetry.record('confidence_scored', sessionId, {
      scalar: stored.scalar,
      level: stored.level,
      action: stored.recommendedAction,
      source: stored.source,
      rollingAverage: memory.rollingAverage,
      trend: memory.trend,
      taskType: stored.taskType,
    })

    console.log(
      `${LOG} Session ${sessionId}: score=${stored.scalar.toFixed(2)} trend=${memory.trend}`,
    )

    return memory
  }

  /** Active UAM row for the session, if any. */
  getMemory(sessionId: string): UncertaintyMemory | null {
    return this.memories.get(sessionId) ?? null
  }

  /** Latest rolling average or neutral default when unknown. */
  getRollingAverage(sessionId: string): number {
    return this.memories.get(sessionId)?.rollingAverage ?? 0.7
  }

  /** Latest trend or `stable` when unknown. */
  getTrend(sessionId: string): UncertaintyMemory['trend'] {
    return this.memories.get(sessionId)?.trend ?? 'stable'
  }

  /**
   * XML fragment for prompt injection (empty when no scores exist for the session).
   */
  buildUAMContext(sessionId: string): string {
    const memory = this.memories.get(sessionId)
    if (memory === undefined || memory.entries.length === 0) {
      return ''
    }

    const last3 = memory.entries.slice(-3)
    const factors = dedupePreserveOrder(
      last3.flatMap((e) => e.uncertaintyFactors),
      5,
    )
    const gaps = dedupePreserveOrder(
      last3.flatMap((e) => e.knowledgeGaps),
      3,
    )

    const factorsXml = factors.map((f) => `<factor>${escapeXml(f)}</factor>`).join('\n')
    const gapsXml = gaps.map((g) => `<gap>${escapeXml(g)}</gap>`).join('\n')

    return `<uncertainty_aware_memory>
<session_confidence_average>${memory.rollingAverage.toFixed(2)}</session_confidence_average>
<confidence_trend>${memory.trend}</confidence_trend>
<recent_uncertainty_factors>
${factorsXml}
</recent_uncertainty_factors>
<open_knowledge_gaps>
${gapsXml}
</open_knowledge_gaps>
</uncertainty_aware_memory>`
  }

  /**
   * True when the session trend is degrading and the rolling average is below the UAR trigger τ.
   */
  isConfidenceDegrading(sessionId: string): boolean {
    const memory = this.memories.get(sessionId)
    if (memory === undefined) return false
    return (
      memory.trend === 'degrading' &&
      memory.rollingAverage < CONFIDENCE_THRESHOLDS.UAR_TRIGGER
    )
  }

  /** Aggregate stats over all recorded scores for the session. */
  getSessionStats(sessionId: string): {
    totalScores: number
    averageScore: number
    lowestScore: number
    highestScore: number
    uarTriggerCount: number
    hardBlockCount: number
    currentTrend: string
  } {
    const memory = this.memories.get(sessionId)
    if (memory === undefined || memory.entries.length === 0) {
      return {
        totalScores: 0,
        averageScore: 0,
        lowestScore: 0,
        highestScore: 0,
        uarTriggerCount: 0,
        hardBlockCount: 0,
        currentTrend: 'stable',
      }
    }

    const scalars = memory.entries.map((e) => e.scalar)
    let uarTriggerCount = 0
    let hardBlockCount = 0
    for (const s of scalars) {
      if (s < CONFIDENCE_THRESHOLDS.UAR_TRIGGER) uarTriggerCount++
      if (s < CONFIDENCE_THRESHOLDS.HARD_BLOCK) hardBlockCount++
    }

    return {
      totalScores: memory.entries.length,
      averageScore: average(scalars),
      lowestScore: Math.min(...scalars),
      highestScore: Math.max(...scalars),
      uarTriggerCount,
      hardBlockCount,
      currentTrend: memory.trend,
    }
  }

  /** Drops UAM state for the session. */
  clearSession(sessionId: string): void {
    this.memories.delete(sessionId)
    this.rollingAvgHistory.delete(sessionId)
  }
}

/** Shared in-process {@link ConfidenceMemoryStore}. */
export const confidenceMemoryStore = new ConfidenceMemoryStore()
