/**
 * In-memory rolling telemetry for the Jarvis pipeline: turns, routing, retrieval, workers, and costs.
 */

import { v4 as uuidv4 } from 'uuid'

import { CONFIDENCE_THRESHOLDS } from '@/reasoning/confidenceTypes'

/** USD per 1K tokens used for rough cost in {@link TelemetryCollector.record} `prompt_assembled` events. */
const PROMPT_ASSEMBLED_COST_PER_1K_TOKENS_USD = 0.005

/** All supported telemetry event categories. */
export type TelemetryEventType =
  | 'turn_started'
  | 'turn_completed'
  | 'route_classified'
  | 'retrieval_gate_decision'
  | 'worker_executed'
  | 'worker_verified'
  | 'prompt_assembled'
  | 'context_compacted'
  | 'search_fired'
  | 'react_thought'
  | 'react_observation'
  | 'react_trace_complete'
  | 'scratchpad_confidence_update'
  | 'reflexion_critique'
  | 'tot_search_complete'
  | 'tot_decision'
  | 'cost_warning'
  | 'model_routed'
  | 'confidence_scored'
  | 'pre_task_confidence'
  | 'error'

/**
 * Single immutable event row stored in {@link TelemetryCollector}.
 * Passed to {@link TelemetryCollector.subscribe} callbacks (SSE and other live consumers).
 */
export interface TelemetryEvent {
  /** Unique id (uuid v4). */
  id: string
  type: TelemetryEventType
  sessionId: string
  /** ISO-8601 timestamp when the event was recorded. */
  timestamp: string
  durationMs?: number
  /** Type-specific payload (routes, gate source, token counts, etc.). */
  data: Record<string, unknown>
  error?: string
}

/** Aggregated per-session metrics derived from recorded events. */
export interface SessionSummary {
  sessionId: string
  startedAt: string
  lastActivityAt: string
  turnCount: number
  totalTokensUsed: number
  totalCostUsd: number
  routeBreakdown: Record<string, number>
  webSearchCount: number
  sessionHitCount: number
  longTermHitCount: number
  workerCallCount: number
  /** Fraction of worker verifications that passed (0–1). */
  verificationPassRate: number
  avgVerificationScore: number
  compactionCount: number
  errorCount: number
  avgTurnLatencyMs: number
  /** ReAct reasoning rollups for this session (present after ReAct events). */
  reasoningStats?: {
    totalThoughts: number
    avgConfidence: number
    lowConfidenceCount: number
    traceCount: number
    /** Count of {@link TelemetryEventType} `scratchpad_confidence_update` events for this session. */
    scratchpadSamples: number
    /** Rolling mean of scratchpad trajectory confidence (separate from thought {@link avgConfidence}). */
    avgScratchpadConfidence: number
    /** Rollups from {@link TelemetryEventType} `reflexion_critique` events. */
    reflexionStats?: {
      totalCritiques: number
      avgCritiqueScore: number
      /** Critiques that passed on iteration 1. */
      passedFirstAttempt: number
      /** Sum of `lessonsLearnedCount` fields on reflexion critique event payloads. */
      totalLessonsLearned: number
    }
    /** Rollups from `tot_decision` and `tot_search_complete` events. */
    totStats?: {
      /** Times {@link TelemetryEventType} `tot_decision` had `usedTot: true`. */
      totalSearches: number
      /** Rolling mean of `nodesGenerated` from completed ToT beam searches. */
      avgNodesExplored: number
      /** Rolling mean of `bestScore` from completed ToT beam searches. */
      avgBestScore: number
      /** Times {@link TelemetryEventType} `tot_decision` had `usedTot: false`. */
      skippedCount: number
    }
    /** Rollups from {@link TelemetryEventType} `confidence_scored` events. */
    confidenceStats?: {
      totalScored: number
      avgScore: number
      /** Count where `action` is `trigger_uar` or `escalate_model` (resolver invoked). */
      uarTriggerCount: number
      /** Count where scalar is below {@link CONFIDENCE_THRESHOLDS.HARD_BLOCK}. */
      hardBlockCount: number
      /** Count where `action === 'proceed_with_flag'`. */
      flaggedOutputCount: number
      /** Latest `trend` from the most recent `confidence_scored` event in this session. */
      currentTrend: 'improving' | 'stable' | 'degrading'
    }
  }
  /** Rollups from {@link TelemetryEventType} `model_routed` events for this session. */
  routingStats?: {
    totalRoutedCalls: number
    /** Tier id → number of routing decisions. */
    byTier: Partial<Record<string, number>>
    /** Count of routes where `wasOverridden` was true (hard-rule / guardrail overrides). */
    overrideCount: number
    /** Sum of `estimatedCostUSD` from each `model_routed` payload. */
    totalEstimatedCostUSD: number
  }
  /** Rollups from {@link TelemetryEventType} `pre_task_confidence` events for this session. */
  preTaskStats?: {
    totalEstimates: number
    blockedCount: number
    lowConfidenceCount: number
    avgPreTaskConfidence: number
  }
}

/** Internal row: same as {@link SessionSummary} plus running totals for averages. */
type MutableSession = SessionSummary & {
  _latencySumMs: number
  _latencyN: number
  _verPass: number
  _verTotal: number
  _verScoreSum: number
  _verScoreN: number
  /** Samples for {@link SessionSummary.reasoningStats} `totStats` averages (from `tot_search_complete`). */
  _totSearchCompleteSamples?: number
  _totNodesGeneratedSum?: number
  _totBestScoreSum?: number
}

function createMutableSession(sessionId: string, firstTs: string): MutableSession {
  return {
    sessionId,
    startedAt: firstTs,
    lastActivityAt: firstTs,
    turnCount: 0,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    routeBreakdown: {},
    webSearchCount: 0,
    sessionHitCount: 0,
    longTermHitCount: 0,
    workerCallCount: 0,
    verificationPassRate: 0,
    avgVerificationScore: 0,
    compactionCount: 0,
    errorCount: 0,
    avgTurnLatencyMs: 0,
    _latencySumMs: 0,
    _latencyN: 0,
    _verPass: 0,
    _verTotal: 0,
    _verScoreSum: 0,
    _verScoreN: 0,
  }
}

function toPublicSummary(m: MutableSession): SessionSummary {
  return {
    sessionId: m.sessionId,
    startedAt: m.startedAt,
    lastActivityAt: m.lastActivityAt,
    turnCount: m.turnCount,
    totalTokensUsed: m.totalTokensUsed,
    totalCostUsd: m.totalCostUsd,
    routeBreakdown: { ...m.routeBreakdown },
    webSearchCount: m.webSearchCount,
    sessionHitCount: m.sessionHitCount,
    longTermHitCount: m.longTermHitCount,
    workerCallCount: m.workerCallCount,
    verificationPassRate: m.verificationPassRate,
    avgVerificationScore: m.avgVerificationScore,
    compactionCount: m.compactionCount,
    errorCount: m.errorCount,
    avgTurnLatencyMs: m.avgTurnLatencyMs,
    ...(m.reasoningStats !== undefined
      ? {
          reasoningStats: cloneReasoningStatsForSummary(m.reasoningStats),
        }
      : {}),
    ...(m.routingStats !== undefined
      ? {
          routingStats: {
            totalRoutedCalls: m.routingStats.totalRoutedCalls,
            overrideCount: m.routingStats.overrideCount,
            totalEstimatedCostUSD: m.routingStats.totalEstimatedCostUSD,
            byTier: { ...m.routingStats.byTier },
          },
        }
      : {}),
    ...(m.preTaskStats !== undefined ? { preTaskStats: { ...m.preTaskStats } } : {}),
  }
}

function cloneReasoningStatsForSummary(
  rs: NonNullable<SessionSummary['reasoningStats']>,
): SessionSummary['reasoningStats'] {
  const { reflexionStats, totStats, confidenceStats, ...rest } = rs
  return {
    ...rest,
    ...(reflexionStats !== undefined ? { reflexionStats: { ...reflexionStats } } : {}),
    ...(totStats !== undefined ? { totStats: { ...totStats } } : {}),
    ...(confidenceStats !== undefined ? { confidenceStats: { ...confidenceStats } } : {}),
  }
}

/** Cross-session snapshot returned by {@link TelemetryCollector.getSystemStats}. */
export interface SystemStats {
  totalEvents: number
  activeSessions: number
  totalTurns: number
  totalWebSearches: number
  totalWorkerCalls: number
  avgVerificationScore: number
  /** Count of {@link TelemetryEvent} rows that contributed to {@link avgVerificationScore}. */
  verificationSampleCount: number
  totalErrors: number
  /** Count of `error` events in the rolling buffer from roughly the last 10 minutes. */
  recentErrors: number
  oldestEventAt: string | null
  newestEventAt: string | null
  reasoningStats: {
    totalThoughts: number
    avgConfidence: number
    lowConfidenceRate: number
    scratchpadSamples: number
    avgScratchpadConfidence: number
    reflexion: {
      totalCritiques: number
      avgCritiqueScore: number
      passedFirstAttemptRate: number
      totalLessonsLearned: number
    }
    tot: {
      totalSearches: number
      avgNodesExplored: number
      avgBestScore: number
      skippedCount: number
    }
    /** Aggregated {@link SessionSummary.reasoningStats.confidenceStats} across sessions. */
    confidenceStats: {
      totalScored: number
      avgScore: number
      uarTriggerCount: number
      hardBlockCount: number
      flaggedOutputCount: number
      currentTrend: 'improving' | 'stable' | 'degrading'
    }
  }
  /** Aggregated {@link SessionSummary.routingStats} across active sessions. */
  routingStats: {
    totalRoutedCalls: number
    byTier: Partial<Record<string, number>>
    overrideCount: number
    totalEstimatedCostUSD: number
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  return undefined
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  return undefined
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return undefined
}

type ConfidenceTrend = 'improving' | 'stable' | 'degrading'

function parseConfidenceTrend(value: unknown): ConfidenceTrend {
  const s = typeof value === 'string' ? value.trim() : ''
  if (s === 'improving' || s === 'stable' || s === 'degrading') {
    return s
  }
  return 'stable'
}

/**
 * Collects pipeline events in a bounded buffer and maintains per-session rollups.
 */
export default class TelemetryCollector {
  private readonly events: TelemetryEvent[] = []

  private readonly sessionSummaries = new Map<string, MutableSession>()

  /** Live fan-out for SSE / dashboards; keyed by subscriber id from {@link subscribe}. */
  private readonly subscribers = new Map<string, (event: TelemetryEvent) => void>()

  private readonly maxEvents: number

  /**
   * @param maxEvents - Rolling cap; oldest events are dropped when exceeded.
   */
  constructor(maxEvents: number = 1000) {
    this.maxEvents = Math.max(1, maxEvents)
  }

  /**
   * Records one event, updates the session summary, enforces the rolling window, and returns the event.
   */
  record(
    type: TelemetryEventType,
    sessionId: string,
    data: Record<string, unknown>,
    durationMs?: number,
    error?: string,
  ): TelemetryEvent {
    const event: TelemetryEvent = {
      id: uuidv4(),
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      durationMs,
      data: { ...data },
      error,
    }

    this.events.push(event)
    while (this.events.length > this.maxEvents) {
      this.events.shift()
    }

    this.updateSessionSummary(event)

    this.subscribers.forEach((cb) => {
      try {
        cb(event)
      } catch {
        /* Subscriber error — ignore */
      }
    })

    return event
  }

  /**
   * Register a callback invoked synchronously after each {@link record} (same process).
   * @param callback - Receives the immutable {@link TelemetryEvent} just stored.
   * @returns Opaque id for {@link unsubscribe}.
   */
  subscribe(callback: (event: TelemetryEvent) => void): string {
    const subscriberId = uuidv4()
    this.subscribers.set(subscriberId, callback)
    return subscriberId
  }

  /**
   * Remove a listener registered with {@link subscribe}.
   * @param subscriberId - Value returned from {@link subscribe}; no-op if unknown.
   */
  unsubscribe(subscriberId: string): void {
    this.subscribers.delete(subscriberId)
  }

  private applyTurnCompleted(s: MutableSession, event: TelemetryEvent): void {
    s.turnCount++
    const d = asNumber(event.durationMs)
    if (d !== undefined && d >= 0) {
      s._latencySumMs += d
      s._latencyN++
      s.avgTurnLatencyMs = s._latencySumMs / s._latencyN
    }
  }

  private applyRetrievalGate(s: MutableSession, event: TelemetryEvent): void {
    const source = asString(event.data.source)
    if (source === 'session' || source === 'session_fallback') {
      s.sessionHitCount++
    } else if (source === 'long_term') {
      s.longTermHitCount++
    }
    if (asBoolean(event.data.shouldSearchWeb) === true) {
      s.webSearchCount++
    }
  }

  private applyWorkerVerified(s: MutableSession, event: TelemetryEvent): void {
    s._verTotal++
    if (asBoolean(event.data.passed) === true) {
      s._verPass++
    }
    s.verificationPassRate = s._verTotal > 0 ? s._verPass / s._verTotal : 0
    const score = asNumber(event.data.score)
    if (score !== undefined) {
      s._verScoreSum += score
      s._verScoreN++
      s.avgVerificationScore = s._verScoreSum / s._verScoreN
    }
  }

  private applyPromptAssembled(s: MutableSession, event: TelemetryEvent): void {
    const tokens = asNumber(event.data.tokensUsed)
    if (tokens !== undefined && tokens >= 0) {
      s.totalTokensUsed += tokens
      s.totalCostUsd = (s.totalTokensUsed / 1000) * PROMPT_ASSEMBLED_COST_PER_1K_TOKENS_USD
    }
  }

  private ensureReasoningStats(s: MutableSession): NonNullable<SessionSummary['reasoningStats']> {
    if (s.reasoningStats === undefined) {
      s.reasoningStats = {
        totalThoughts: 0,
        avgConfidence: 0,
        lowConfidenceCount: 0,
        traceCount: 0,
        scratchpadSamples: 0,
        avgScratchpadConfidence: 0,
      }
    }
    return s.reasoningStats
  }

  private ensureRoutingStats(s: MutableSession): NonNullable<SessionSummary['routingStats']> {
    if (s.routingStats === undefined) {
      s.routingStats = {
        totalRoutedCalls: 0,
        byTier: {},
        overrideCount: 0,
        totalEstimatedCostUSD: 0,
      }
    }
    return s.routingStats
  }

  private ensureConfidenceStats(
    s: MutableSession,
  ): NonNullable<NonNullable<SessionSummary['reasoningStats']>['confidenceStats']> {
    const summary = this.ensureReasoningStats(s)
    if (summary.confidenceStats === undefined) {
      summary.confidenceStats = {
        totalScored: 0,
        avgScore: 0,
        uarTriggerCount: 0,
        hardBlockCount: 0,
        flaggedOutputCount: 0,
        currentTrend: 'stable',
      }
    }
    return summary.confidenceStats
  }

  private ensurePreTaskStats(s: MutableSession): NonNullable<SessionSummary['preTaskStats']> {
    if (s.preTaskStats === undefined) {
      s.preTaskStats = {
        totalEstimates: 0,
        blockedCount: 0,
        lowConfidenceCount: 0,
        avgPreTaskConfidence: 0,
      }
    }
    return s.preTaskStats
  }

  private applyPreTaskConfidence(s: MutableSession, event: TelemetryEvent): void {
    const pt = this.ensurePreTaskStats(s)
    const conf = asNumber(event.data.confidence)
    pt.totalEstimates++
    const n = pt.totalEstimates
    if (event.data.shouldProceed === false) {
      pt.blockedCount++
    }
    if (conf !== undefined && Number.isFinite(conf) && conf < 0.6) {
      pt.lowConfidenceCount++
    }
    const v =
      conf !== undefined && Number.isFinite(conf)
        ? conf
        : n === 1
          ? 0
          : pt.avgPreTaskConfidence
    pt.avgPreTaskConfidence = (pt.avgPreTaskConfidence * (n - 1) + v) / n
  }

  private applyConfidenceScored(s: MutableSession, event: TelemetryEvent): void {
    const cs = this.ensureConfidenceStats(s)
    const scalar = asNumber(event.data.scalar) ?? 0
    const action = asString(event.data.action) ?? ''

    cs.totalScored++
    const n = cs.totalScored
    cs.avgScore = (cs.avgScore * (n - 1) + scalar) / n

    // NOTE: uarTriggerCount = times UncertaintyResolver.resolve() was called (trigger_uar and escalate_model).
    // To distinguish paths, split into uarTriggerCount (trigger_uar only) and uarEscalationCount (escalate_model only).
    if (action === 'trigger_uar' || action === 'escalate_model') {
      cs.uarTriggerCount++
    }
    if (scalar < CONFIDENCE_THRESHOLDS.HARD_BLOCK) {
      cs.hardBlockCount++
    }
    if (action === 'proceed_with_flag') {
      cs.flaggedOutputCount++
    }
    cs.currentTrend = parseConfidenceTrend(event.data.trend)
  }

  private applyModelRouted(s: MutableSession, event: TelemetryEvent): void {
    const rs = this.ensureRoutingStats(s)
    rs.totalRoutedCalls++
    const tier = asString(event.data.tier) ?? 'unknown'
    rs.byTier[tier] = (rs.byTier[tier] ?? 0) + 1
    if (asBoolean(event.data.wasOverridden) === true) {
      rs.overrideCount++
    }
    const est = asNumber(event.data.estimatedCostUSD)
    if (est !== undefined) {
      rs.totalEstimatedCostUSD += est
    }
  }

  private applyReactThought(s: MutableSession, event: TelemetryEvent): void {
    const summary = this.ensureReasoningStats(s)
    summary.totalThoughts++
    const conf = asNumber(event.data.confidence) ?? 0
    summary.avgConfidence =
      (summary.avgConfidence * (summary.totalThoughts - 1) + conf) / summary.totalThoughts
    if (conf < 0.65) {
      summary.lowConfidenceCount++
    }
  }

  private applyReactTraceComplete(s: MutableSession): void {
    const summary = this.ensureReasoningStats(s)
    summary.traceCount++
  }

  /** Rolls scratchpad trajectory confidence into {@link SessionSummary.reasoningStats}. */
  private applyScratchpadConfidenceUpdate(s: MutableSession, event: TelemetryEvent): void {
    const summary = this.ensureReasoningStats(s)
    const conf = asNumber(event.data.confidence) ?? 0
    summary.scratchpadSamples = (summary.scratchpadSamples ?? 0) + 1
    const n = summary.scratchpadSamples
    summary.avgScratchpadConfidence =
      ((summary.avgScratchpadConfidence ?? 0) * (n - 1) + conf) / n
  }

  private applyReflexionCritique(s: MutableSession, event: TelemetryEvent): void {
    const summary = this.ensureReasoningStats(s)
    if (summary.reflexionStats === undefined) {
      summary.reflexionStats = {
        totalCritiques: 0,
        avgCritiqueScore: 0,
        passedFirstAttempt: 0,
        totalLessonsLearned: 0,
      }
    }
    const rs = summary.reflexionStats
    const score = asNumber(event.data.score) ?? 0
    const iteration = asNumber(event.data.iteration) ?? 0
    const passed = asBoolean(event.data.passed) === true
    const lessonsDelta = asNumber(event.data.lessonsLearnedCount) ?? 0

    rs.totalCritiques++
    const n = rs.totalCritiques
    rs.avgCritiqueScore = (rs.avgCritiqueScore * (n - 1) + score) / n

    /**
     * NOTE: `passedFirstAttempt` (see {@link SessionSummary.reasoningStats} `reflexionStats`) counts ANY
     * `reflexion_critique` event where `iteration === 1` and `passed === true`, including
     * quick-critique-only paths (where no full `CriticAgent` call was made).
     * To count only full Critic passes: filter on `event.data.quickCritiqueOnly !== true`.
     * The current behaviour intentionally counts quick passes as first-attempt passes since
     * the output quality is the same regardless of evaluation path.
     */
    if (iteration === 1 && passed) {
      rs.passedFirstAttempt++
    }

    rs.totalLessonsLearned += lessonsDelta
  }

  private ensureTotStats(
    s: MutableSession,
  ): NonNullable<NonNullable<SessionSummary['reasoningStats']>['totStats']> {
    const summary = this.ensureReasoningStats(s)
    if (summary.totStats === undefined) {
      summary.totStats = {
        totalSearches: 0,
        avgNodesExplored: 0,
        avgBestScore: 0,
        skippedCount: 0,
      }
    }
    return summary.totStats
  }

  private applyTotDecision(s: MutableSession, event: TelemetryEvent): void {
    const ts = this.ensureTotStats(s)
    if (asBoolean(event.data.usedTot) === true) {
      ts.totalSearches++
    } else {
      ts.skippedCount++
    }
  }

  private applyTotSearchComplete(s: MutableSession, event: TelemetryEvent): void {
    const ts = this.ensureTotStats(s)
    const nodes = asNumber(event.data.nodesGenerated) ?? 0
    const best = asNumber(event.data.bestScore) ?? 0
    const prevN = s._totSearchCompleteSamples ?? 0
    const n = prevN + 1
    s._totSearchCompleteSamples = n
    s._totNodesGeneratedSum = (s._totNodesGeneratedSum ?? 0) + nodes
    s._totBestScoreSum = (s._totBestScoreSum ?? 0) + best
    ts.avgNodesExplored = (s._totNodesGeneratedSum ?? 0) / n
    ts.avgBestScore = (s._totBestScoreSum ?? 0) / n
  }

  private updateSessionSummary(event: TelemetryEvent): void {
    let s = this.sessionSummaries.get(event.sessionId)
    if (s === undefined) {
      s = createMutableSession(event.sessionId, event.timestamp)
      this.sessionSummaries.set(event.sessionId, s)
    }

    s.lastActivityAt = event.timestamp

    switch (event.type) {
      case 'turn_started':
        break
      case 'turn_completed':
        this.applyTurnCompleted(s, event)
        break
      case 'route_classified': {
        const route = asString(event.data.route) ?? 'unknown'
        s.routeBreakdown[route] = (s.routeBreakdown[route] ?? 0) + 1
        break
      }
      case 'retrieval_gate_decision':
        this.applyRetrievalGate(s, event)
        break
      case 'worker_executed':
        s.workerCallCount++
        break
      case 'worker_verified':
        this.applyWorkerVerified(s, event)
        break
      case 'prompt_assembled':
        this.applyPromptAssembled(s, event)
        break
      case 'context_compacted':
        s.compactionCount++
        break
      case 'search_fired':
        s.webSearchCount++
        break
      case 'error':
        s.errorCount++
        break
      case 'react_thought':
        this.applyReactThought(s, event)
        break
      case 'react_observation':
        break
      case 'react_trace_complete':
        this.applyReactTraceComplete(s)
        break
      case 'scratchpad_confidence_update':
        this.applyScratchpadConfidenceUpdate(s, event)
        break
      case 'reflexion_critique':
        this.applyReflexionCritique(s, event)
        break
      case 'tot_decision':
        this.applyTotDecision(s, event)
        break
      case 'tot_search_complete':
        this.applyTotSearchComplete(s, event)
        break
      case 'cost_warning':
        break
      case 'model_routed':
        this.applyModelRouted(s, event)
        break
      case 'confidence_scored':
        this.applyConfidenceScored(s, event)
        break
      case 'pre_task_confidence':
        this.applyPreTaskConfidence(s, event)
        break
      default:
        break
    }
  }

  /**
   * Latest events first; optional filters by session and/or type.
   */
  getRecentEvents(limit: number = 50, sessionId?: string, type?: TelemetryEventType): TelemetryEvent[] {
    let list = [...this.events]
    if (sessionId !== undefined) {
      list = list.filter((e) => e.sessionId === sessionId)
    }
    if (type !== undefined) {
      list = list.filter((e) => e.type === type)
    }
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return list.slice(0, Math.max(0, limit))
  }

  /** Snapshot for one session, or null if none. */
  getSessionSummary(sessionId: string): SessionSummary | null {
    const s = this.sessionSummaries.get(sessionId)
    return s === undefined ? null : toPublicSummary(s)
  }

  /** All sessions, most recently active first. */
  getAllSessionSummaries(): SessionSummary[] {
    return [...this.sessionSummaries.values()]
      .map(toPublicSummary)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
  }

  private accumulateReasoningRollups(
    rs: SessionSummary['reasoningStats'],
    acc: {
      reasoningThoughtsTotal: number
      reasoningWeightedConfSum: number
      reasoningLowConfTotal: number
      reasoningScratchpadSamplesTotal: number
      reasoningScratchpadWeightedSum: number
    },
  ): void {
    if (rs === undefined) {
      return
    }
    if (rs.totalThoughts > 0) {
      acc.reasoningThoughtsTotal += rs.totalThoughts
      acc.reasoningWeightedConfSum += rs.avgConfidence * rs.totalThoughts
      acc.reasoningLowConfTotal += rs.lowConfidenceCount
    }
    const sp = rs.scratchpadSamples ?? 0
    if (sp > 0) {
      acc.reasoningScratchpadSamplesTotal += sp
      acc.reasoningScratchpadWeightedSum += (rs.avgScratchpadConfidence ?? 0) * sp
    }
  }

  /**
   * Cross-session aggregates for dashboards.
   */
  getSystemStats(): SystemStats {
    const summaries = [...this.sessionSummaries.values()]
    let globalVerScoreSum = 0
    let globalVerScoreN = 0
    const reasoningAcc = {
      reasoningThoughtsTotal: 0,
      reasoningWeightedConfSum: 0,
      reasoningLowConfTotal: 0,
      reasoningScratchpadSamplesTotal: 0,
      reasoningScratchpadWeightedSum: 0,
    }
    let reflexionTotalCritiques = 0
    let reflexionCritiqueScoreSum = 0
    let reflexionPassedFirstAttempt = 0
    let reflexionTotalLessonsLearned = 0
    let totTotalSearches = 0
    let totSkippedCount = 0
    let totSearchSamplesTotal = 0
    let totNodesWeightedSum = 0
    let totBestScoreWeightedSum = 0
    const routingAcc = {
      totalRoutedCalls: 0,
      byTier: {} as Partial<Record<string, number>>,
      overrideCount: 0,
      totalEstimatedCostUSD: 0,
    }
    const confidenceAcc = {
      totalScoredSum: 0,
      scalarWeightedSum: 0,
      uarTriggerCount: 0,
      hardBlockCount: 0,
      flaggedOutputCount: 0,
    }
    let confidenceTrendLatest: ConfidenceTrend = 'stable'
    let confidenceTrendLatestTs = 0
    for (const m of summaries) {
      globalVerScoreSum += m._verScoreSum
      globalVerScoreN += m._verScoreN
      this.accumulateReasoningRollups(m.reasoningStats, reasoningAcc)
      const rs = m.reasoningStats?.reflexionStats
      if (rs !== undefined) {
        reflexionTotalCritiques += rs.totalCritiques
        reflexionCritiqueScoreSum += rs.avgCritiqueScore * rs.totalCritiques
        reflexionPassedFirstAttempt += rs.passedFirstAttempt
        reflexionTotalLessonsLearned += rs.totalLessonsLearned
      }
      const tot = m.reasoningStats?.totStats
      if (tot !== undefined) {
        totTotalSearches += tot.totalSearches
        totSkippedCount += tot.skippedCount
      }
      const totSamples = m._totSearchCompleteSamples ?? 0
      if (totSamples > 0 && tot !== undefined) {
        totSearchSamplesTotal += totSamples
        totNodesWeightedSum += tot.avgNodesExplored * totSamples
        totBestScoreWeightedSum += tot.avgBestScore * totSamples
      }
      const rout = m.routingStats
      if (rout !== undefined) {
        routingAcc.totalRoutedCalls += rout.totalRoutedCalls
        routingAcc.overrideCount += rout.overrideCount
        routingAcc.totalEstimatedCostUSD += rout.totalEstimatedCostUSD
        for (const [tierKey, c] of Object.entries(rout.byTier)) {
          const v = typeof c === 'number' && !Number.isNaN(c) ? c : 0
          routingAcc.byTier[tierKey] = (routingAcc.byTier[tierKey] ?? 0) + v
        }
      }
      const cstat = m.reasoningStats?.confidenceStats
      if (cstat !== undefined && cstat.totalScored > 0) {
        confidenceAcc.totalScoredSum += cstat.totalScored
        confidenceAcc.scalarWeightedSum += cstat.avgScore * cstat.totalScored
        confidenceAcc.uarTriggerCount += cstat.uarTriggerCount
        confidenceAcc.hardBlockCount += cstat.hardBlockCount
        confidenceAcc.flaggedOutputCount += cstat.flaggedOutputCount
        const act = new Date(m.lastActivityAt).getTime()
        if (!Number.isNaN(act) && act >= confidenceTrendLatestTs) {
          confidenceTrendLatestTs = act
          confidenceTrendLatest = cstat.currentTrend
        }
      }
    }
    const times = this.events.map((e) => new Date(e.timestamp).getTime()).filter((t) => !Number.isNaN(t))
    const oldest = times.length > 0 ? Math.min(...times) : null
    const newest = times.length > 0 ? Math.max(...times) : null
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    const recentErrors = this.events.filter(
      (e) => e.type === 'error' && new Date(e.timestamp).getTime() > tenMinutesAgo,
    ).length
    return {
      totalEvents: this.events.length,
      activeSessions: this.sessionSummaries.size,
      totalTurns: summaries.reduce((a, s) => a + s.turnCount, 0),
      totalWebSearches: summaries.reduce((a, s) => a + s.webSearchCount, 0),
      totalWorkerCalls: summaries.reduce((a, s) => a + s.workerCallCount, 0),
      avgVerificationScore: globalVerScoreN > 0 ? globalVerScoreSum / globalVerScoreN : 0,
      verificationSampleCount: globalVerScoreN,
      totalErrors: summaries.reduce((a, s) => a + s.errorCount, 0),
      recentErrors,
      oldestEventAt: oldest !== null ? new Date(oldest).toISOString() : null,
      newestEventAt: newest !== null ? new Date(newest).toISOString() : null,
      reasoningStats: {
        totalThoughts: reasoningAcc.reasoningThoughtsTotal,
        avgConfidence:
          reasoningAcc.reasoningThoughtsTotal > 0
            ? reasoningAcc.reasoningWeightedConfSum / reasoningAcc.reasoningThoughtsTotal
            : 0,
        lowConfidenceRate:
          reasoningAcc.reasoningThoughtsTotal > 0
            ? reasoningAcc.reasoningLowConfTotal / reasoningAcc.reasoningThoughtsTotal
            : 0,
        scratchpadSamples: reasoningAcc.reasoningScratchpadSamplesTotal,
        avgScratchpadConfidence:
          reasoningAcc.reasoningScratchpadSamplesTotal > 0
            ? reasoningAcc.reasoningScratchpadWeightedSum / reasoningAcc.reasoningScratchpadSamplesTotal
            : 0,
        reflexion: {
          totalCritiques: reflexionTotalCritiques,
          avgCritiqueScore:
            reflexionTotalCritiques > 0 ? reflexionCritiqueScoreSum / reflexionTotalCritiques : 0,
          passedFirstAttemptRate:
            reflexionTotalCritiques > 0 ? reflexionPassedFirstAttempt / reflexionTotalCritiques : 0,
          totalLessonsLearned: reflexionTotalLessonsLearned,
        },
        tot: {
          totalSearches: totTotalSearches,
          skippedCount: totSkippedCount,
          avgNodesExplored:
            totSearchSamplesTotal > 0 ? totNodesWeightedSum / totSearchSamplesTotal : 0,
          avgBestScore:
            totSearchSamplesTotal > 0 ? totBestScoreWeightedSum / totSearchSamplesTotal : 0,
        },
        confidenceStats: {
          totalScored: confidenceAcc.totalScoredSum,
          avgScore:
            confidenceAcc.totalScoredSum > 0
              ? confidenceAcc.scalarWeightedSum / confidenceAcc.totalScoredSum
              : 0,
          uarTriggerCount: confidenceAcc.uarTriggerCount,
          hardBlockCount: confidenceAcc.hardBlockCount,
          flaggedOutputCount: confidenceAcc.flaggedOutputCount,
          currentTrend: confidenceTrendLatest,
        },
      },
      routingStats: {
        totalRoutedCalls: routingAcc.totalRoutedCalls,
        byTier: { ...routingAcc.byTier },
        overrideCount: routingAcc.overrideCount,
        totalEstimatedCostUSD: routingAcc.totalEstimatedCostUSD,
      },
    }
  }

  /** Drops buffered events and the summary row for a session. */
  clearSession(sessionId: string): void {
    this.sessionSummaries.delete(sessionId)
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i]!.sessionId === sessionId) {
        this.events.splice(i, 1)
      }
    }
  }

  /** All events for a session, oldest first (handy for export). */
  exportSessionEvents(sessionId: string): TelemetryEvent[] {
    return this.events
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }
}

/** Shared process-wide collector (bounded to 1000 events by default). */
export const telemetry = new TelemetryCollector()
