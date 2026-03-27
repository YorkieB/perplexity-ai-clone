import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

/** SSE / JSON payload shape for `event: telemetry` rows from `/api/dashboard/stream`. */
export interface TelemetryEvent {
  type: string
  sessionId: string
  data: Record<string, unknown>
  timestamp: string
}

export interface ReActTraceEntry {
  sessionId: string
  step: 'thought' | 'action' | 'observation'
  content: string
  taskType: string
  timestamp: string
  confidenceScore?: number
}

export interface ConfidencePoint {
  timestamp: string
  scalar: number
  level: string
  action: string
  taskType: string
  sessionId: string
}

export interface ReflexionEvent {
  timestamp: string
  iteration: number
  critiqueScore: number
  passed: boolean
  taskType: string
  sessionId: string
}

export interface TotSearchSummary {
  timestamp: string
  nodesExplored: number
  nodesPruned: number
  bestScore: number
  taskType: string
  durationMs: number
}

export interface DashboardState {
  /** Connection */
  isConnected: boolean
  lastHeartbeat: string | null

  /** ReAct traces */
  recentTraces: ReActTraceEntry[]

  /** Confidence */
  confidenceHistory: ConfidencePoint[]
  sessionConfidenceTrend: 'improving' | 'stable' | 'degrading'

  /** Cost */
  costByTier: Record<string, { calls: number; costUSD: number }>
  totalCostUSD: number
  sessionCostToDate: number

  /** Routing */
  routingByTier: Record<string, number>
  overrideCount: number

  /** Reflexion */
  reflexionEvents: ReflexionEvent[]
  avgCritiqueScore: number

  /** ToT */
  totSearches: TotSearchSummary[]
  avgNodesExplored: number

  /** System */
  systemStats: Record<string, unknown> | null

  /** {@link TelemetryEvent} `pre_task_confidence` rollups for the live SSE stream. */
  preTaskStats: {
    totalEstimates: number
    blockedCount: number
    lowConfidenceCount: number
    avgPreTaskConfidence: number
  }
}

const MAX_TRACES = 20
const MAX_CONFIDENCE = 50
const MAX_REFLEXION = 20
const MAX_TOT = 10

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  return undefined
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function parseTrend(value: unknown): 'improving' | 'stable' | 'degrading' {
  const s = asString(value, 'stable').trim()
  if (s === 'improving' || s === 'stable' || s === 'degrading') {
    return s
  }
  return 'stable'
}

function appendCapped<T>(list: T[], item: T, max: number): T[] {
  const next = [...list, item]
  return next.length > max ? next.slice(next.length - max) : next
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Default {@link DashboardState} before the first SSE `connected` / snapshot. */
export const INITIAL_DASHBOARD_STATE: DashboardState = {
  isConnected: false,
  lastHeartbeat: null,
  recentTraces: [],
  confidenceHistory: [],
  sessionConfidenceTrend: 'stable',
  costByTier: {},
  totalCostUSD: 0,
  sessionCostToDate: 0,
  routingByTier: {},
  overrideCount: 0,
  reflexionEvents: [],
  avgCritiqueScore: 0,
  totSearches: [],
  avgNodesExplored: 0,
  systemStats: null,
  preTaskStats: {
    totalEstimates: 0,
    blockedCount: 0,
    lowConfidenceCount: 0,
    avgPreTaskConfidence: 0,
  },
}

/**
 * Merge one telemetry row into dashboard state (immutable).
 *
 * Handles 8 explicit telemetry event types + default no-op:
 * react_thought, react_action, react_observation,
 * confidence_scored, model_routed, reflexion_critique,
 * tot_search_complete, cost_warning
 * Previous spec comment said 7 — implementation correctly handles 8.
 */
function _applyEvent(state: DashboardState, event: TelemetryEvent): DashboardState {
  const d = event.data
  const sessionId = event.sessionId
  const ts = event.timestamp
  const taskType = asString(d.taskType, 'unknown')

  switch (event.type) {
    case 'react_thought': {
      const thoughtType = asString(d.type, 'thought')
      const conf = asNumber(d.confidence)
      let content = `Thought · ${thoughtType}`
      if (conf !== undefined) {
        content += ` (confidence ${conf.toFixed(2)})`
      }
      const entry: ReActTraceEntry = {
        sessionId,
        step: 'thought',
        content,
        taskType,
        timestamp: ts,
        ...(conf !== undefined ? { confidenceScore: conf } : {}),
      }
      return { ...state, recentTraces: appendCapped(state.recentTraces, entry, MAX_TRACES) }
    }
    case 'react_action': {
      const desc = asString(d.description, asString(d.actionType, 'action'))
      const entry: ReActTraceEntry = {
        sessionId,
        step: 'action',
        content: desc.length > 0 ? desc : 'Action',
        taskType,
        timestamp: ts,
      }
      return { ...state, recentTraces: appendCapped(state.recentTraces, entry, MAX_TRACES) }
    }
    case 'react_observation': {
      const status = asString(d.status, 'unknown')
      const meets = d.meetsExpectation
      let content = `Observation · ${status}`
      if (typeof meets === 'boolean') {
        content += ` · meetsExpectation: ${String(meets)}`
      }
      const entry: ReActTraceEntry = {
        sessionId,
        step: 'observation',
        content,
        taskType,
        timestamp: ts,
      }
      return { ...state, recentTraces: appendCapped(state.recentTraces, entry, MAX_TRACES) }
    }
    case 'confidence_scored': {
      const scalar = asNumber(d.scalar) ?? 0
      const point: ConfidencePoint = {
        timestamp: ts,
        scalar,
        level: asString(d.level, ''),
        action: asString(d.action, ''),
        taskType,
        sessionId,
      }
      return {
        ...state,
        confidenceHistory: appendCapped(state.confidenceHistory, point, MAX_CONFIDENCE),
        sessionConfidenceTrend: parseTrend(d.trend),
      }
    }
    case 'model_routed': {
      const tier = asString(d.tier, 'unknown')
      const est = asNumber(d.estimatedCostUSD) ?? 0
      const prevTier = state.costByTier[tier] ?? { calls: 0, costUSD: 0 }
      const costByTier = {
        ...state.costByTier,
        [tier]: { calls: prevTier.calls + 1, costUSD: prevTier.costUSD + est },
      }
      const routingByTier = {
        ...state.routingByTier,
        [tier]: (state.routingByTier[tier] ?? 0) + 1,
      }
      let overrideCount = state.overrideCount
      if (asBoolean(d.wasOverridden)) {
        overrideCount++
      }
      return {
        ...state,
        costByTier,
        routingByTier,
        overrideCount,
        totalCostUSD: state.totalCostUSD + est,
      }
    }
    case 'reflexion_critique': {
      const critiqueScore = asNumber(d.score) ?? 0
      const iteration = asNumber(d.iteration) ?? 0
      const ev: ReflexionEvent = {
        timestamp: ts,
        iteration,
        critiqueScore,
        passed: asBoolean(d.passed),
        taskType,
        sessionId,
      }
      const reflexionEvents = appendCapped(state.reflexionEvents, ev, MAX_REFLEXION)
      const avgCritiqueScore = average(reflexionEvents.map((e) => e.critiqueScore))
      return { ...state, reflexionEvents, avgCritiqueScore }
    }
    case 'tot_search_complete': {
      const nodesExplored = asNumber(d.nodesGenerated) ?? asNumber(d.nodesExplored) ?? 0
      const nodesPruned = asNumber(d.nodesPruned) ?? 0
      const bestScore = asNumber(d.bestScore) ?? 0
      const durationMs = asNumber(d.durationMs) ?? 0
      const summary: TotSearchSummary = {
        timestamp: ts,
        nodesExplored,
        nodesPruned,
        bestScore,
        taskType,
        durationMs,
      }
      const totSearches = appendCapped(state.totSearches, summary, MAX_TOT)
      const avgNodesExplored = average(totSearches.map((t) => t.nodesExplored))
      return { ...state, totSearches, avgNodesExplored }
    }
    case 'cost_warning': {
      const total = asNumber(d.totalCostUSD)
      return total !== undefined
        ? { ...state, sessionCostToDate: total, totalCostUSD: total }
        : state
    }
    case 'pre_task_confidence': {
      const conf = asNumber(d.confidence)
      const prev = state.preTaskStats
      const totalEstimates = prev.totalEstimates + 1
      const blockedCount = prev.blockedCount + (d.shouldProceed === false ? 1 : 0)
      const lowConfidenceCount =
        prev.lowConfidenceCount +
        (conf !== undefined && Number.isFinite(conf) && conf < 0.6 ? 1 : 0)
      const v =
        conf !== undefined && Number.isFinite(conf)
          ? conf
          : prev.totalEstimates === 0
            ? 0
            : prev.avgPreTaskConfidence
      const avgPreTaskConfidence =
        (prev.avgPreTaskConfidence * prev.totalEstimates + v) / totalEstimates
      return {
        ...state,
        preTaskStats: {
          totalEstimates,
          blockedCount,
          lowConfidenceCount,
          avgPreTaskConfidence,
        },
      }
    }
    default:
      return state
  }
}

function isTelemetryEventPayload(value: unknown): value is TelemetryEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const o = value as Record<string, unknown>
  return (
    typeof o.type === 'string' &&
    typeof o.sessionId === 'string' &&
    o.data !== null &&
    typeof o.data === 'object' &&
    !Array.isArray(o.data) &&
    typeof o.timestamp === 'string'
  )
}

function applySnapshotToState(
  setState: Dispatch<SetStateAction<DashboardState>>,
  body: unknown,
): void {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return
  }
  const stats = (body as { stats?: unknown }).stats
  if (stats !== undefined && stats !== null && typeof stats === 'object' && !Array.isArray(stats)) {
    setState((s) => ({ ...s, systemStats: stats as Record<string, unknown> }))
  }
}

async function fetchDashboardSnapshot(setState: Dispatch<SetStateAction<DashboardState>>): Promise<void> {
  try {
    const r = await fetch('/api/dashboard/snapshot')
    const body: unknown = await r.json()
    applySnapshotToState(setState, body)
  } catch {
    /* snapshot optional — ignore */
  }
}

function onSseHeartbeat(
  setState: Dispatch<SetStateAction<DashboardState>>,
  e: MessageEvent<string>,
): void {
  try {
    const data = JSON.parse(e.data) as { ts?: string }
    const ts = typeof data.ts === 'string' ? data.ts : null
    setState((s) => ({ ...s, lastHeartbeat: ts }))
  } catch {
    /* ignore malformed heartbeat */
  }
}

function onSseTelemetry(
  setState: Dispatch<SetStateAction<DashboardState>>,
  e: MessageEvent<string>,
): void {
  try {
    const parsed: unknown = JSON.parse(e.data)
    if (isTelemetryEventPayload(parsed)) {
      setState((s) => _applyEvent(s, parsed))
    }
  } catch {
    /* ignore malformed telemetry */
  }
}

/**
 * Subscribes to Jarvis dashboard SSE (`/api/dashboard/stream`) and folds telemetry into {@link DashboardState}.
 * @param sessionId - Filter to one session, or `'all'` for every session (server-side filter).
 */
export default function useJarvisTelemetry(sessionId: string = 'all'): DashboardState {
  const [state, setState] = useState<DashboardState>(INITIAL_DASHBOARD_STATE)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setState({ ...INITIAL_DASHBOARD_STATE })

    const q = encodeURIComponent(sessionId)
    const es = new EventSource(`/api/dashboard/stream?sessionId=${q}`)
    eventSourceRef.current = es

    const onConnected = (): void => {
      setState((s) => ({ ...s, isConnected: true }))
      fetchDashboardSnapshot(setState).catch(() => {
        /* snapshot optional — ignore */
      })
    }

    const onError = (): void => {
      setState((s) => ({ ...s, isConnected: false }))
    }

    es.addEventListener('connected', onConnected)
    es.addEventListener('heartbeat', (e) => onSseHeartbeat(setState, e))
    es.addEventListener('telemetry', (e) => onSseTelemetry(setState, e))
    es.onerror = onError

    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [sessionId])

  return state
}
