/**
 * In-memory rolling telemetry for the Jarvis pipeline: turns, routing, retrieval, workers, and costs.
 */

import { v4 as uuidv4 } from 'uuid'

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
  | 'error'

/** Single immutable event row stored in {@link TelemetryCollector}. */
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
}

/** Internal row: same as {@link SessionSummary} plus running totals for averages. */
type MutableSession = SessionSummary & {
  _latencySumMs: number
  _latencyN: number
  _verPass: number
  _verTotal: number
  _verScoreSum: number
  _verScoreN: number
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

/**
 * Collects pipeline events in a bounded buffer and maintains per-session rollups.
 */
export default class TelemetryCollector {
  private readonly events: TelemetryEvent[] = []

  private readonly sessionSummaries = new Map<string, MutableSession>()

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
    return event
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

  /**
   * Cross-session aggregates for dashboards.
   */
  getSystemStats(): {
    totalEvents: number
    activeSessions: number
    totalTurns: number
    totalWebSearches: number
    totalWorkerCalls: number
    avgVerificationScore: number
    /** Count of {@link TelemetryEvent} rows that contributed to {@link avgVerificationScore}. */
    verificationSampleCount: number
    totalErrors: number
    /** Count of {@link TelemetryEventType} `error` rows in the rolling buffer whose timestamp is within the last 10 minutes. */
    recentErrors: number
    oldestEventAt: string | null
    newestEventAt: string | null
  } {
    const summaries = [...this.sessionSummaries.values()]
    let globalVerScoreSum = 0
    let globalVerScoreN = 0
    for (const m of summaries) {
      globalVerScoreSum += m._verScoreSum
      globalVerScoreN += m._verScoreN
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
