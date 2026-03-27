import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react'

import type { SessionSummary, TelemetryEvent, TelemetryEventType } from '@/lib/observability/telemetryCollector'
import type { PromptVersion } from '@/lib/prompts/promptRegistry'
import type { RegressionSuiteResult } from '@/lib/prompts/promptRegressionTests'

/**
 * Base URL for the Express health router (no trailing slash).
 * In Vite dev, `vite.config.ts` can proxy `/api/health` — then leave this empty for same-origin fetches.
 */
const HEALTH_API_BASE = (import.meta.env.VITE_HEALTH_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

const REFRESH_MS = 5000
const STALE_MS = 15_000

/** Routes that use the Manager–Worker path (for gate + web-search risk styling). */
const MW_INTENT_ROUTES = new Set<string>([
  'code_instruction',
  'voice_task',
  'image_task',
  'browser_task',
  'file_task',
  'clarification_needed',
])

interface HealthChecks {
  promptRegistry: {
    status: string
    activeVersion: string | null
    validationScore: number
  }
  routerInitialised: boolean
  routeCacheStats: { size: number; maxSize: number; hitRate: string }
  systemStats: {
    totalEvents: number
    activeSessions: number
    totalTurns: number
    totalWebSearches: number
    totalWorkerCalls: number
    avgVerificationScore: number
    verificationSampleCount: number
    totalErrors: number
    oldestEventAt: string | null
    newestEventAt: string | null
  }
}

interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'critical'
  uptime: number
  timestamp: string
  checks: HealthChecks
}

interface PromptsPayload {
  activeVersion: PromptVersion | null
  history: PromptVersion[]
  stats: HealthChecks['systemStats']
}

type RegressionUiState =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; result: RegressionSuiteResult }
  | { state: 'error'; message: string }

function apiUrl(path: string): string {
  return `${HEALTH_API_BASE}${path}`
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text.length > 0 ? (JSON.parse(text) as unknown) : null
  } catch {
    throw new Error(`Non-JSON response (${String(res.status)})`)
  }
  if (!res.ok) {
    const err =
      body !== null && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${String(res.status)}`
    throw new Error(err)
  }
  return body as T
}

function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '—'
  }
  const s = Math.floor(totalSeconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (d > 0) {
    parts.push(`${String(d)}d`)
  }
  if (h > 0 || d > 0) {
    parts.push(`${String(h)}h`)
  }
  parts.push(`${String(m)}m`)
  return parts.join(' ')
}

function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString()
}

function truncateId(id: string, max = 10): string {
  if (id.length <= max) {
    return id
  }
  return `${id.slice(0, max)}…`
}

function truncateText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) {
    return t
  }
  return `${t.slice(0, max)}…`
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function summarizeRouteClassified(data: Record<string, unknown>): string {
  const route = asStr(data.route) ?? '?'
  const conf = asNum(data.confidence)
  const pct = conf !== undefined ? String(Math.round(conf * 100)) + '%' : '?'
  return route + ' (' + pct + ')'
}

function summarizeRetrievalGate(data: Record<string, unknown>): string {
  const src = asStr(data.source) ?? '?'
  const web = asBool(data.shouldSearchWeb) === true ? 'web' : 'no-web'
  const n = asNum(data.chunksReturned)
  const chunks = n !== undefined ? String(n) : '?'
  return src + ' · ' + web + ' · chunks ' + chunks
}

function summarizeWorkerExecuted(data: Record<string, unknown>): string {
  const ok = asBool(data.success) === true ? 'ok' : 'fail'
  const tok = asNum(data.tokensUsed)
  if (tok === undefined) {
    return ok
  }
  return ok + ' · ' + String(tok) + ' tok'
}

function summarizeWorkerVerified(data: Record<string, unknown>): string {
  const p = asBool(data.passed)
  const head = p === true ? 'pass' : 'fail'
  const sc = asNum(data.score)
  if (sc === undefined) {
    return head
  }
  return head + ' · ' + sc.toFixed(2)
}

function summarizeTurnCompleted(data: Record<string, unknown>): string {
  const route = asStr(data.route) ?? '?'
  const len = asNum(data.responseLength)
  if (len === undefined) {
    return route
  }
  return route + ' · ' + String(len) + ' chars'
}

function summarizeSearchFired(data: Record<string, unknown>): string {
  const q = asStr(data.query)
  return q !== undefined ? truncateText(q, 48) : 'search'
}

function summarizeErrorEvent(data: Record<string, unknown>): string {
  const ctx = asStr(data.context)
  const msg = asStr(data.message)
  return truncateText([ctx, msg].filter(Boolean).join(' — ') || 'error', 64)
}

function summarizeContextCompacted(data: Record<string, unknown>): string {
  const before = asNum(data.tokensBefore)
  const after = asNum(data.tokensAfter)
  if (before !== undefined && after !== undefined) {
    return 'Δ ' + String(before - after) + ' tok'
  }
  return 'compacted'
}

function summarizePromptAssembled(data: Record<string, unknown>): string {
  const t = asNum(data.totalTokens)
  return t !== undefined ? String(t) + ' tok' : 'assembled'
}

function summarizeTurnStarted(data: Record<string, unknown>): string {
  const len = asNum(data.messageLength)
  return len !== undefined ? 'msg ' + String(len) + ' chars' : 'start'
}

const EVENT_SUMMARIZERS: Record<TelemetryEventType, (data: Record<string, unknown>) => string> = {
  route_classified: summarizeRouteClassified,
  retrieval_gate_decision: summarizeRetrievalGate,
  worker_executed: summarizeWorkerExecuted,
  worker_verified: summarizeWorkerVerified,
  search_fired: summarizeSearchFired,
  error: summarizeErrorEvent,
  context_compacted: summarizeContextCompacted,
  turn_completed: summarizeTurnCompleted,
  prompt_assembled: summarizePromptAssembled,
  turn_started: summarizeTurnStarted,
}

function summarizeEvent(type: TelemetryEventType, data: Record<string, unknown>): string {
  return EVENT_SUMMARIZERS[type](data)
}

function eventRowClasses(type: TelemetryEventType, data: Record<string, unknown>): string {
  const base = 'border-b border-zinc-800/80 px-2 py-1 text-[11px] leading-tight font-mono'
  if (type === 'route_classified') {
    return base + ' bg-sky-950/40 text-sky-100'
  }
  if (type === 'retrieval_gate_decision') {
    const intent = asStr(data.intentRoute)
    const web = asBool(data.shouldSearchWeb) === true
    const mwRisk = web && intent !== undefined && MW_INTENT_ROUTES.has(intent)
    if (mwRisk) {
      return base + ' bg-red-950/50 text-red-100'
    }
    return base + ' bg-violet-950/40 text-violet-100'
  }
  if (type === 'worker_executed') {
    return base + ' bg-indigo-950/40 text-indigo-100'
  }
  if (type === 'worker_verified') {
    return asBool(data.passed) === true
      ? base + ' bg-emerald-950/40 text-emerald-100'
      : base + ' bg-red-950/50 text-red-100'
  }
  if (type === 'search_fired') {
    return base + ' bg-amber-950/40 text-amber-100'
  }
  if (type === 'context_compacted') {
    return base + ' bg-orange-950/40 text-orange-100'
  }
  if (type === 'error') {
    return base + ' bg-red-950/60 text-red-50'
  }
  if (type === 'turn_completed') {
    return base + ' bg-zinc-900/80 text-zinc-300'
  }
  return base + ' bg-zinc-900/60 text-zinc-400'
}

function statusBadgeClasses(status: HealthSnapshot['status']): string {
  if (status === 'healthy') {
    return 'bg-emerald-700 text-white'
  }
  if (status === 'degraded') {
    return 'bg-amber-600 text-black'
  }
  if (status === 'critical') {
    return 'bg-red-700 text-white'
  }
  return 'bg-zinc-600 text-white'
}

function verificationColor(score: number): string {
  if (score >= 0.8) {
    return 'text-emerald-400'
  }
  if (score >= 0.6) {
    return 'text-amber-400'
  }
  return 'text-red-400'
}

function SystemStatusSkeleton(): ReactElement {
  return (
    <div className="space-y-2">
      <div className="h-6 w-28 animate-pulse rounded bg-zinc-800" />
      <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

function RegressionResultLine({ regression }: { regression: RegressionUiState }): ReactElement | null {
  if (regression.state === 'running') {
    return <span className="ml-2 text-[11px] text-zinc-500">Running routing regression…</span>
  }
  if (regression.state === 'done') {
    const { result } = regression
    const cls = result.passed ? 'text-emerald-400' : 'text-red-400'
    const body = result.passed
      ? '✅ ' + String(result.passedTests) + '/' + String(result.totalTests) + ' passed'
      : '❌ ' +
        String(result.blockerTests) +
        ' blockers failed · ' +
        String(result.failedTests) +
        ' failed total · ' +
        String(result.passedTests) +
        '/' +
        String(result.totalTests) +
        ' passed'
    return (
      <div className={'mt-1 text-[11px] ' + cls}>
        {body}
        <span className="text-zinc-500"> ({String(result.durationMs)} ms)</span>
      </div>
    )
  }
  if (regression.state === 'error') {
    return <div className="mt-1 text-[11px] text-red-400">❌ {regression.message}</div>
  }
  return null
}

interface SystemStatusLoadedProps {
  readonly health: HealthSnapshot
  readonly sys: HealthChecks['systemStats'] | undefined
  readonly cacheHit: string
  readonly regression: RegressionUiState
  readonly onRunBlockerTests: () => void
}

function SystemStatusLoaded({
  health,
  sys,
  cacheHit,
  regression,
  onRunBlockerTests,
}: SystemStatusLoadedProps): ReactElement {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={'rounded px-2 py-0.5 text-[10px] font-bold uppercase ' + statusBadgeClasses(health.status)}>
          {health.status}
        </span>
        <span className="text-xs text-zinc-400">
          Uptime <span className="text-zinc-200">{formatUptime(health.uptime)}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Total turns (buffer)</div>
          <div className="font-mono text-zinc-100">{sys !== undefined ? String(sys.totalTurns) : '—'}</div>
        </div>
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Web searches</div>
          <div className="font-mono text-zinc-100">{sys !== undefined ? String(sys.totalWebSearches) : '—'}</div>
        </div>
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Worker calls</div>
          <div className="font-mono text-zinc-100">{sys !== undefined ? String(sys.totalWorkerCalls) : '—'}</div>
        </div>
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Avg verification</div>
          <div className={'font-mono ' + (sys !== undefined ? verificationColor(sys.avgVerificationScore) : 'text-zinc-400')}>
            {sys !== undefined ? sys.avgVerificationScore.toFixed(3) : '—'}
            {sys !== undefined && sys.verificationSampleCount === 0 ? (
              <span className="text-zinc-600"> (no samples)</span>
            ) : null}
          </div>
        </div>
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Errors</div>
          <div className={'font-mono ' + (sys !== undefined && sys.totalErrors > 0 ? 'text-red-400' : 'text-zinc-100')}>
            {sys !== undefined ? String(sys.totalErrors) : '—'}
          </div>
        </div>
        <div className="rounded bg-zinc-950/60 px-2 py-1">
          <div className="text-zinc-500">Router cache hit</div>
          <div className="font-mono text-zinc-100">{cacheHit}</div>
        </div>
      </div>
      <div className="mt-2 border-t border-zinc-800 pt-2">
        <button
          type="button"
          disabled={regression.state === 'running'}
          className="rounded bg-sky-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          onClick={onRunBlockerTests}
        >
          Run Blocker Tests
        </button>
        <RegressionResultLine regression={regression} />
      </div>
    </>
  )
}

interface SystemStatusPanelProps {
  readonly loading: boolean
  readonly health: HealthSnapshot | null
  readonly cacheHit: string
  readonly regression: RegressionUiState
  readonly onRunBlockerTests: () => void
}

function SystemStatusPanel({
  loading,
  health,
  cacheHit,
  regression,
  onRunBlockerTests,
}: SystemStatusPanelProps): ReactElement {
  let body: ReactElement
  if (loading && health === null) {
    body = <SystemStatusSkeleton />
  } else if (health === null) {
    body = <p className="text-xs text-zinc-500">No data</p>
  } else {
    body = (
      <SystemStatusLoaded
        health={health}
        sys={health.checks.systemStats}
        cacheHit={cacheHit}
        regression={regression}
        onRunBlockerTests={onRunBlockerTests}
      />
    )
  }

  return (
    <section className="flex min-h-[220px] flex-col rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <h2 className="mb-2 border-b border-zinc-800 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">System status</h2>
      {body}
    </section>
  )
}

function PromptRegistrySkeleton(): ReactElement {
  return (
    <div className="space-y-2">
      <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
      <div className="h-2 w-full animate-pulse rounded bg-zinc-800" />
      <div className="h-16 animate-pulse rounded bg-zinc-800" />
    </div>
  )
}

function PromptActiveBanner({ active }: { readonly active: PromptVersion | null }): ReactElement {
  if (active === null) {
    return <p className="mb-2 text-[11px] text-red-400">No active version</p>
  }
  const barPct = Math.min(100, Math.max(0, active.validationScore * 100))
  return (
    <div className="mb-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-100">{active.name}</span>
        <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 font-mono text-emerald-200">v{active.version}</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-300">
          score {(active.validationScore * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
        <div className="h-full bg-emerald-600" style={{ width: String(barPct) + '%' }} />
      </div>
    </div>
  )
}

function PromptVersionMiniTable({ versions }: { readonly versions: PromptVersion[] }): ReactElement {
  return (
    <div className="max-h-[140px] overflow-auto">
      <table className="w-full border-collapse text-left text-[10px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="py-1 pr-1">Version</th>
            <th className="py-1 pr-1">Score</th>
            <th className="py-1 pr-1">Author</th>
            <th className="py-1 pr-1">Changelog</th>
            <th className="py-1">Act</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-zinc-800/80">
              <td className="py-0.5 pr-1 font-mono text-zinc-200">v{v.version}</td>
              <td className="py-0.5 pr-1 font-mono">{(v.validationScore * 100).toFixed(0)}%</td>
              <td className="py-0.5 pr-1 text-zinc-400">{v.author}</td>
              <td className="max-w-[120px] truncate py-0.5 pr-1 text-zinc-500" title={v.changelog}>
                {truncateText(v.changelog, 32)}
              </td>
              <td className="py-0.5">{v.isActive ? '●' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PromptRegistryLoadedBodyProps {
  readonly prompts: PromptsPayload
  readonly onRollback: () => void
}

function PromptRegistryLoadedBody({ prompts, onRollback }: PromptRegistryLoadedBodyProps): ReactElement {
  return (
    <>
      <PromptActiveBanner active={prompts.activeVersion} />
      <PromptVersionMiniTable versions={prompts.history.slice(0, 5)} />
      <button
        type="button"
        className="mt-2 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-950/50"
        onClick={onRollback}
      >
        Rollback 1 step
      </button>
    </>
  )
}

interface PromptRegistryPanelProps {
  readonly loading: boolean
  readonly prompts: PromptsPayload | null
  readonly onRollback: () => void
}

function PromptRegistryPanel({ loading, prompts, onRollback }: PromptRegistryPanelProps): ReactElement {
  let body: ReactElement
  if (loading && prompts === null) {
    body = <PromptRegistrySkeleton />
  } else if (prompts === null) {
    body = <p className="text-xs text-zinc-500">No data</p>
  } else {
    body = <PromptRegistryLoadedBody prompts={prompts} onRollback={onRollback} />
  }

  return (
    <section className="flex min-h-[220px] flex-col rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <h2 className="mb-2 border-b border-zinc-800 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">Prompt registry</h2>
      {body}
    </section>
  )
}

interface SessionsPanelProps {
  readonly loading: boolean
  readonly sessions: SessionSummary[]
  readonly expandedSessionId: string | null
  readonly expandedEvents: TelemetryEvent[] | null
  readonly expandedLoading: boolean
  readonly onToggleSession: (sessionId: string) => void
}

function SessionsPanel({
  loading,
  sessions,
  expandedSessionId,
  expandedEvents,
  expandedLoading,
  onToggleSession,
}: SessionsPanelProps): ReactElement {
  if (loading && sessions.length === 0) {
    return (
      <section className="flex min-h-[220px] flex-col rounded border border-zinc-800 bg-zinc-900/40 p-2">
        <h2 className="mb-2 border-b border-zinc-800 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">Recent sessions</h2>
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-zinc-800" />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="flex min-h-[220px] flex-col rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <h2 className="mb-2 border-b border-zinc-800 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">Recent sessions</h2>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead>
            <tr className="sticky top-0 border-b border-zinc-800 bg-zinc-900 text-zinc-500">
              <th className="py-1 pr-1">Session</th>
              <th className="py-1 pr-1">Turns</th>
              <th className="py-1 pr-1">Tok</th>
              <th className="py-1 pr-1">$</th>
              <th className="py-1 pr-1">Err</th>
              <th className="py-1 pr-1">Verif</th>
              <th className="py-1">Last</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <Fragment key={s.sessionId}>
                <tr
                  className={
                    'cursor-pointer border-b border-zinc-800/80 hover:bg-zinc-800/40 ' +
                    (s.errorCount > 0 ? 'bg-red-950/20 text-red-100' : '')
                  }
                  onClick={() => {
                    onToggleSession(s.sessionId)
                  }}
                >
                  <td className="py-0.5 pr-1 font-mono text-zinc-200">{truncateId(s.sessionId, 12)}</td>
                  <td className="py-0.5 pr-1 font-mono">{String(s.turnCount)}</td>
                  <td className="py-0.5 pr-1 font-mono">{String(s.totalTokensUsed)}</td>
                  <td className="py-0.5 pr-1 font-mono">{s.totalCostUsd.toFixed(3)}</td>
                  <td className="py-0.5 pr-1 font-mono">{String(s.errorCount)}</td>
                  <td className={'py-0.5 pr-1 font-mono ' + verificationColor(s.avgVerificationScore)}>
                    {s.avgVerificationScore.toFixed(2)}
                  </td>
                  <td className="py-0.5 text-zinc-500">{formatClock(s.lastActivityAt)}</td>
                </tr>
                {expandedSessionId === s.sessionId ? (
                  <tr className="bg-zinc-950/80">
                    <td colSpan={7} className="px-1 py-2">
                      {expandedLoading ? (
                        <div className="h-8 animate-pulse rounded bg-zinc-800" />
                      ) : (
                        <div className="max-h-40 overflow-auto font-mono text-[10px] text-zinc-400">
                          {(expandedEvents ?? []).map((ev) => (
                            <div key={ev.id} className="border-b border-zinc-800/60 py-0.5">
                              [{formatClock(ev.timestamp)}] {ev.type} {summarizeEvent(ev.type, ev.data)}
                            </div>
                          ))}
                          {expandedEvents !== null && expandedEvents.length === 0 ? (
                            <span className="text-zinc-600">No events</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface LiveEventFeedPanelProps {
  readonly loading: boolean
  readonly events: TelemetryEvent[]
  readonly feedRef: RefObject<HTMLDivElement | null>
  readonly paused: boolean
  readonly onTogglePause: () => void
}

function LiveEventFeedPanel({
  loading,
  events,
  feedRef,
  paused,
  onTogglePause,
}: LiveEventFeedPanelProps): ReactElement {
  return (
    <section className="flex min-h-[220px] flex-col rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <h2 className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
        <span>Live event feed</span>
        <button
          type="button"
          className="rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-normal normal-case hover:bg-zinc-800"
          onClick={onTogglePause}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
      </h2>
      {loading && events.length === 0 ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div
          ref={feedRef}
          className="max-h-96 min-h-[160px] overflow-y-auto rounded border border-zinc-800/80 bg-zinc-950/50"
        >
          {events.map((ev) => (
            <div key={ev.id} className={eventRowClasses(ev.type, ev.data)}>
              <span className="text-zinc-500">{formatClock(ev.timestamp)}</span>{' '}
              <span className="font-bold text-zinc-200">{ev.type}</span>{' '}
              <span className="text-zinc-500">{truncateId(ev.sessionId, 8)}</span>{' '}
              <span className="text-zinc-300">{summarizeEvent(ev.type, ev.data)}</span>
              {ev.error !== undefined ? <span className="text-red-300"> · {ev.error}</span> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Dense internal observability UI for the Jarvis health API (`/api/health/**`).
 *
 * Configure `VITE_HEALTH_API_BASE_URL` if the API is not same-origin, or use the Vite `/api/health` proxy (`VITE_HEALTH_API_PROXY`).
 * Rollback requires `VITE_JARVIS_ADMIN_KEY` (sent as `X-Jarvis-Admin`) matching server `JARVIS_ADMIN_KEY`.
 */
export default function HealthDashboard(): ReactElement {
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastOkAt, setLastOkAt] = useState<number | null>(null)

  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [events, setEvents] = useState<TelemetryEvent[]>([])
  const [prompts, setPrompts] = useState<PromptsPayload | null>(null)

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<TelemetryEvent[] | null>(null)
  const [expandedLoading, setExpandedLoading] = useState(false)

  const [regression, setRegression] = useState<RegressionUiState>({ state: 'idle' })

  const feedRef = useRef<HTMLDivElement>(null)
  const eventsSigRef = useRef<string>('')

  const loadAll = useCallback(async () => {
    try {
      const [h, sess, ev, pr] = await Promise.all([
        fetchJson<HealthSnapshot>('/api/health'),
        fetchJson<SessionSummary[]>('/api/health/sessions?limit=10'),
        fetchJson<TelemetryEvent[]>('/api/health/events?limit=50'),
        fetchJson<PromptsPayload>('/api/health/prompts'),
      ])
      setHealth(h)
      setSessions(sess)
      setEvents(ev)
      setPrompts(pr)
      setError(null)
      setLastOkAt(Date.now())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  useEffect(() => {
    if (paused) {
      return undefined
    }
    const id = window.setInterval(() => {
      loadAll().catch(() => {})
    }, REFRESH_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [paused, loadAll])

  useLayoutEffect(() => {
    const sig = events.map((e) => e.id).join('|')
    if (paused || sig === eventsSigRef.current) {
      return
    }
    eventsSigRef.current = sig
    const el = feedRef.current
    if (el !== null) {
      el.scrollTop = 0
    }
  }, [events, paused])

  useEffect(() => {
    if (expandedSessionId === null) {
      setExpandedEvents(null)
      return
    }
    let cancelled = false
    setExpandedLoading(true)
    const path = '/api/health/sessions/' + encodeURIComponent(expandedSessionId)
    fetchJson<{ summary: SessionSummary | null; recentEvents: TelemetryEvent[] }>(path)
      .then((r) => {
        if (!cancelled) {
          setExpandedEvents(r.recentEvents)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExpandedEvents([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExpandedLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [expandedSessionId])

  const lastUpdatedLabel = lastOkAt !== null ? new Date(lastOkAt).toLocaleString() : '—'
  const isStale = lastOkAt !== null && Date.now() - lastOkAt > STALE_MS
  const cacheHit = health?.checks.routeCacheStats.hitRate ?? '—'

  const runBlockerRoutingTests = useCallback(() => {
    setRegression({ state: 'running' })
    fetchJson<RegressionSuiteResult>('/api/health/regression-tests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ categories: ['routing'] }),
    })
      .then((result) => {
        setRegression({ state: 'done', result })
        return loadAll()
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setRegression({ state: 'error', message: msg })
      })
  }, [loadAll])

  const rollbackOne = useCallback(() => {
    const active = prompts?.activeVersion
    if (active === undefined || active === null) {
      window.alert('No active prompt version loaded.')
      return
    }
    const adminKey = (import.meta.env.VITE_JARVIS_ADMIN_KEY as string | undefined)?.trim()
    if (adminKey === undefined || adminKey.length === 0) {
      window.alert('Set VITE_JARVIS_ADMIN_KEY in the client env (must match server JARVIS_ADMIN_KEY).')
      return
    }
    const hist = prompts?.history ?? []
    const target = hist.length > 1 && hist[0]?.id === active.id ? hist[1] : undefined
    const confirmMsg =
      target !== undefined
        ? 'Roll back to v' + target.version + '?'
        : 'Roll back 1 step?\n\nCurrent active: ' + active.name + ' v' + active.version
    if (!window.confirm(confirmMsg)) {
      return
    }
    fetchJson<{ rolledBackTo: PromptVersion }>('/api/health/rollback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Jarvis-Admin': adminKey,
      },
      body: JSON.stringify({ steps: 1 }),
    })
      .then(() => loadAll())
      .catch((e: unknown) => {
        window.alert(e instanceof Error ? e.message : String(e))
      })
  }, [prompts, loadAll])

  const toggleSession = useCallback((sessionId: string) => {
    setExpandedSessionId((id) => (id === sessionId ? null : sessionId))
  }, [])

  const togglePause = useCallback(() => {
    setPaused((p) => !p)
  }, [])

  return (
    <div className="flex min-h-0 flex-col gap-2 bg-zinc-950 p-3 text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 pb-2 text-sm">
        <span className="font-semibold tracking-tight">🤖 Jarvis Health Dashboard</span>
        <span className="text-zinc-500">|</span>
        <span className="text-zinc-400">Last updated: {lastUpdatedLabel}</span>
        <span className="text-zinc-500">|</span>
        <button
          type="button"
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-xs hover:bg-zinc-800"
          onClick={togglePause}
        >
          Auto-refresh: {paused ? 'OFF' : 'ON'}
        </button>
      </header>

      {error !== null ? (
        <div className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-100">
          Dashboard unavailable — {error}
        </div>
      ) : null}

      {isStale && error === null ? (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200">
          Data may be stale (no successful refresh in {String(Math.round(STALE_MS / 1000))}s+).
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <SystemStatusPanel
          loading={loading}
          health={health}
          cacheHit={cacheHit}
          regression={regression}
          onRunBlockerTests={runBlockerRoutingTests}
        />
        <PromptRegistryPanel loading={loading} prompts={prompts} onRollback={rollbackOne} />
        <SessionsPanel
          loading={loading}
          sessions={sessions}
          expandedSessionId={expandedSessionId}
          expandedEvents={expandedEvents}
          expandedLoading={expandedLoading}
          onToggleSession={toggleSession}
        />
        <LiveEventFeedPanel
          loading={loading}
          events={events}
          feedRef={feedRef}
          paused={paused}
          onTogglePause={togglePause}
        />
      </div>
    </div>
  )
}
