/**
 * Threshold-based alerts over {@link telemetry} rollups and {@link promptRegistry} state.
 *
 * Start {@link AlertSystem.start} from Node/Electron main or a long-lived server process;
 * avoid importing from browser-only bundles if `promptRegistry` disk IO is undesirable.
 */

import { promptRegistry } from '@/lib/prompts/promptRegistry'

import TelemetryCollector, { telemetry, type SessionSummary } from './telemetryCollector'

/** Snapshot shape from {@link TelemetryCollector.getSystemStats}. */
export type SystemStatsSnapshot = ReturnType<InstanceType<typeof TelemetryCollector>['getSystemStats']>

/**
 * Declarative rule: periodic evaluation against system stats and per-session summaries.
 */
export interface AlertRule {
  id: string
  name: string
  description: string
  severity: 'warning' | 'critical'
  checkFn: (stats: SystemStatsSnapshot, summaries: SessionSummary[]) => boolean
  /** Template; `{placeholders}` filled from {@link AlertSystem.fireAlert} interpolation context. */
  message: string
  /** Minimum milliseconds before the same rule may fire again. */
  cooldownMs: number
  /** Last fire time from `Date.now()`; managed by {@link AlertSystem}. */
  lastFiredAt?: number
}

/**
 * One fired alert instance (history for dashboards or debugging).
 */
export interface Alert {
  ruleId: string
  ruleName: string
  severity: 'warning' | 'critical'
  message: string
  /** ISO-8601 timestamp when the alert was recorded. */
  firedAt: string
}

function recentAvgVerification(summaries: SessionSummary[], take: number): number {
  const recent = summaries.slice(0, take)
  if (recent.length === 0) {
    return 0
  }
  const sum = recent.reduce((acc, s) => acc + s.avgVerificationScore, 0)
  return sum / recent.length
}

function recentCompactionTotal(summaries: SessionSummary[], take: number): number {
  return summaries.slice(0, take).reduce((acc, s) => acc + s.compactionCount, 0)
}

/** Built-in rules aligned with Jarvis telemetry + prompt registry. */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    severity: 'critical',
    description: 'More than 5 errors in the last 10 minutes (rolling window)',
    cooldownMs: 5 * 60 * 1000,
    message: 'ERROR RATE CRITICAL: {errorCount} errors detected',
    checkFn: (stats) => (stats.recentErrors ?? 0) > 5,
  },
  {
    id: 'low-verification-score',
    name: 'Low Verification Score',
    severity: 'warning',
    description: 'Average Worker verification score dropped below 0.6',
    cooldownMs: 10 * 60 * 1000,
    message: 'QUALITY WARNING: Avg verification score {score} below threshold',
    checkFn: (_stats, summaries) => {
      const avg = recentAvgVerification(summaries, 5)
      return avg < 0.6 && avg > 0
    },
  },
  {
    id: 'no-active-prompt',
    name: 'No Active Prompt Version',
    severity: 'critical',
    description: 'Prompt registry has no active version',
    cooldownMs: 60 * 1000,
    message: 'CRITICAL: No active prompt version in registry',
    checkFn: () => promptRegistry.getActive() === null,
  },
  {
    id: 'excessive-web-searches',
    name: 'Excessive Web Searches on Code Routes',
    severity: 'warning',
    description: 'Web searches firing on code_instruction sessions',
    cooldownMs: 10 * 60 * 1000,
    message: 'MISROUTE WARNING: Web searches detected on code_instruction routes',
    checkFn: (_stats, summaries) => {
      const recent = summaries.slice(0, 3)
      return recent.some(
        (s) => s.webSearchCount > 0 && (s.routeBreakdown['code_instruction'] ?? 0) > 0,
      )
    },
  },
  {
    id: 'high-compaction-rate',
    name: 'High Context Compaction Rate',
    severity: 'warning',
    description: 'Context compacting too frequently — may indicate context rot',
    cooldownMs: 15 * 60 * 1000,
    message: 'CONTEXT WARNING: High compaction rate detected ({count} in recent sessions)',
    checkFn: (_stats, summaries) => recentCompactionTotal(summaries, 5) > 10,
  },
]

const LOG = '[AlertSystem]'

/** Replace `{token}` substrings with values from `vars` (missing → empty string). */
function interpolateAlertMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key]
    return v !== undefined ? String(v) : ''
  })
}

function interpolationContext(
  ruleId: string,
  stats: SystemStatsSnapshot,
  summaries: SessionSummary[],
): Record<string, string | number> {
  if (ruleId === 'high-error-rate') {
    return { errorCount: stats.recentErrors ?? 0 }
  }
  if (ruleId === 'low-verification-score') {
    return { score: recentAvgVerification(summaries, 5) }
  }
  if (ruleId === 'high-compaction-rate') {
    return { count: recentCompactionTotal(summaries, 5) }
  }
  return {}
}

/**
 * Periodically evaluates {@link AlertRule}s against live telemetry and logs / records breaches.
 */
export default class AlertSystem {
  /** Active rules (copied from {@link DEFAULT_ALERT_RULES} on construct so `lastFiredAt` is per-instance). */
  rules: AlertRule[]

  /** Newest-first history of fired alerts. */
  private readonly firedAlerts: Alert[] = []

  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.rules = DEFAULT_ALERT_RULES.map((r) => ({ ...r }))
  }

  /**
   * Begins periodic evaluation. Idempotent: restarts the timer if already running.
   *
   * @param intervalMs - Wall clock between {@link check} runs (default 30s).
   */
  start(intervalMs: number = 30_000): void {
    this.stop()
    this.checkInterval = setInterval(() => {
      this.check()
    }, intervalMs)
    console.info(`${LOG} Started — checking every ${String(intervalMs / 1000)}s`)
  }

  /** Stops periodic evaluation. */
  stop(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private check(): void {
    const stats = telemetry.getSystemStats()
    const summaries = telemetry.getAllSessionSummaries()
    const now = Date.now()
    for (const rule of this.rules) {
      if (rule.lastFiredAt !== undefined && now - rule.lastFiredAt < rule.cooldownMs) {
        continue
      }
      if (!rule.checkFn(stats, summaries)) {
        continue
      }
      const ctx = interpolationContext(rule.id, stats, summaries)
      this.fireAlert(rule, ctx)
    }
  }

  /**
   * Logs the alert, appends history, updates cooldown, and mirrors to {@link telemetry} as an `error` row for `sessionId` `system`.
   */
  private fireAlert(rule: AlertRule, vars: Record<string, string | number>): void {
    const message = interpolateAlertMessage(rule.message, vars)
    if (rule.severity === 'critical') {
      console.error('[🚨 ALERT]', message)
    } else {
      console.warn('[⚠️  ALERT]', message)
    }
    const firedAt = new Date().toISOString()
    this.firedAlerts.unshift({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      firedAt,
    })
    const maxHistory = 500
    if (this.firedAlerts.length > maxHistory) {
      this.firedAlerts.length = maxHistory
    }
    rule.lastFiredAt = Date.now()
    telemetry.record(
      'error',
      'system',
      {
        alertId: rule.id,
        severity: rule.severity,
        message,
      },
      undefined,
      message,
    )
  }

  /** Most recently fired alerts, newest first. */
  getFiredAlerts(limit: number = 20): Alert[] {
    return this.firedAlerts.slice(0, Math.max(0, limit))
  }

  /** Registers an additional rule (shallow-copied). */
  addRule(rule: AlertRule): void {
    this.rules.push({ ...rule })
  }

  /** Clears in-memory alert history (does not affect telemetry buffer). */
  clearAlerts(): void {
    this.firedAlerts.length = 0
  }
}

/** Shared {@link AlertSystem} instance (not started automatically). */
export const alertSystem = new AlertSystem()
