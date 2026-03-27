/**
 * Express router for the Jarvis observability / health dashboard.
 *
 * **Mounting (no Next.js API routes in this repo — Vite + Electron):**
 *
 * ```ts
 * import express from 'express'
 * import { createHealthDashboardRouter } from '@/api/healthDashboard'
 *
 * const app = express()
 * app.use(express.json({ limit: '1mb' }))
 * app.use('/api/health', createHealthDashboardRouter())
 * app.listen(3000)
 * ```
 *
 * Set `JARVIS_ADMIN_KEY` for `POST /rollback` (header `X-Jarvis-Admin`).
 *
 * @module api/healthDashboard
 */

import { Router, type NextFunction, type Request, type Response } from 'express'

import { telemetry, type TelemetryEventType } from '@/lib/observability/telemetryCollector'
import { promptRegistry } from '@/lib/prompts/promptRegistry'
import type { PromptVersion } from '@/lib/prompts/promptRegistry'
import { promptExperiments } from '@/lib/prompts/promptExperiments'
import { semanticRouter } from '@/lib/router/semanticRouter'
import { routeCache } from '@/lib/router/routeCache'
import { runRegressionTests } from '@/lib/prompts/promptRegressionTests'
import type { RegressionTestCase } from '@/lib/prompts/promptRegressionTests'

const LOG_PREFIX = '[HealthAPI]'

/** Cooldown between expensive regression suite runs. */
const REGRESSION_COOLDOWN_MS = 30_000

let lastRegressionRunAt = 0

const TELEMETRY_EVENT_TYPES: readonly TelemetryEventType[] = [
  'turn_started',
  'turn_completed',
  'route_classified',
  'retrieval_gate_decision',
  'worker_executed',
  'worker_verified',
  'prompt_assembled',
  'context_compacted',
  'search_fired',
  'react_thought',
  'react_observation',
  'react_trace_complete',
  'scratchpad_confidence_update',
  'reflexion_critique',
  'tot_search_complete',
  'tot_decision',
  'cost_warning',
  'model_routed',
  'confidence_scored',
  'pre_task_confidence',
  'error',
] as const

function isAllowedTelemetryEventType(value: string): value is TelemetryEventType {
  return (TELEMETRY_EVENT_TYPES as readonly string[]).includes(value)
}

const REGRESSION_CATEGORIES: readonly RegressionTestCase['category'][] = [
  'routing',
  'context_awareness',
  'tool_policy',
  'structural',
]

function isRegressionCategory(value: string): value is RegressionTestCase['category'] {
  return (REGRESSION_CATEGORIES as readonly string[]).includes(value)
}

function parseRegressionCategories(body: unknown): RegressionTestCase['category'][] | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined
  }
  const raw = (body as { categories?: unknown }).categories
  if (!Array.isArray(raw)) {
    return undefined
  }
  const filtered = raw.filter((c): c is RegressionTestCase['category'] => typeof c === 'string' && isRegressionCategory(c))
  return filtered.length > 0 ? filtered : undefined
}

function parsePositiveInt(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
  if (!Number.isFinite(n) || n < 1) {
    return fallback
  }
  return Math.min(Math.floor(n), max)
}

function sendJson(res: Response, status: number, body: unknown): void {
  res.status(status).type('application/json').json(body)
}

function logRequestLine(req: Request, status: number, durationMs: number): void {
  const pathOnly = req.originalUrl.split('?')[0] ?? req.originalUrl
  console.info(`${LOG_PREFIX} ${req.method} ${pathOnly} ${String(status)} ${String(durationMs)}ms`)
}

/**
 * Wraps async route handlers: errors become JSON 500 with `{ error }` and are logged.
 */
function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const started = Date.now()
    res.on('finish', () => {
      logRequestLine(req, res.statusCode, Date.now() - started)
    })
    handler(req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} handler error`, err)
      if (!res.headersSent) {
        sendJson(res, 500, { error: msg })
        return
      }
      next(err)
    })
  }
}

type OverallHealthStatus = 'healthy' | 'degraded' | 'critical'

/** Parses `steps` from rollback POST body; default 1 when omitted. */
function parseRollbackSteps(body: unknown): { ok: true; steps: number } | { ok: false; error: string } {
  if (body === null || body === undefined) {
    return { ok: true, steps: 1 }
  }
  if (typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const stepsRaw = (body as { steps?: unknown }).steps
  if (stepsRaw === undefined) {
    return { ok: true, steps: 1 }
  }
  if (typeof stepsRaw === 'number' && Number.isFinite(stepsRaw)) {
    const steps = Math.floor(stepsRaw)
    if (steps < 1) {
      return { ok: false, error: 'body.steps must be a positive integer when provided' }
    }
    return { ok: true, steps }
  }
  if (typeof stepsRaw === 'string') {
    const steps = Number.parseInt(stepsRaw, 10)
    if (!Number.isFinite(steps) || steps < 1) {
      return { ok: false, error: 'body.steps must be a positive integer when provided' }
    }
    return { ok: true, steps }
  }
  return { ok: false, error: 'body.steps must be a positive integer when provided' }
}

function computeOverallStatus(input: {
  activePrompt: PromptVersion | null
  routerInitialised: boolean
  errorRate: number
  avgVerificationScore: number
  verificationSampleCount: number
}): OverallHealthStatus {
  if (input.activePrompt === null || !input.routerInitialised) {
    return 'critical'
  }
  if (input.errorRate > 0.05) {
    return 'degraded'
  }
  if (input.verificationSampleCount > 0 && input.avgVerificationScore < 0.6) {
    return 'degraded'
  }
  return 'healthy'
}

/**
 * Builds the `/api/health` subtree router. Mount at `/api/health` on an Express app that already uses `express.json()` if you POST.
 */
export function createHealthDashboardRouter(): Router {
  const router = Router()

  router.get(
    '/',
    wrapAsync(async (_req, res) => {
      const active = promptRegistry.getActive()
      const routerInitialised = semanticRouter.getRouterInitialised()
      const routeCacheStats = routeCache.getStats()
      const systemStats = telemetry.getSystemStats()
      const errorRate =
        systemStats.totalTurns > 0 ? systemStats.totalErrors / systemStats.totalTurns : 0
      const status = computeOverallStatus({
        activePrompt: active,
        routerInitialised,
        errorRate,
        avgVerificationScore: systemStats.avgVerificationScore,
        verificationSampleCount: systemStats.verificationSampleCount,
      })
      const promptRegistryCheck = {
        status: active === null ? ('critical' as const) : ('ok' as const),
        activeVersion: active?.version ?? null,
        validationScore: active?.validationScore ?? 0,
      }
      sendJson(res, 200, {
        status,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {
          promptRegistry: promptRegistryCheck,
          routerInitialised,
          routeCacheStats,
          systemStats,
        },
      })
    }),
  )

  router.get(
    '/sessions',
    wrapAsync(async (req, res) => {
      const limit = parsePositiveInt(req.query.limit, 20, 500)
      const summaries = telemetry.getAllSessionSummaries().slice(0, limit)
      sendJson(res, 200, summaries)
    }),
  )

  router.get(
    '/sessions/:sessionId',
    wrapAsync(async (req, res) => {
      const rawId = req.params.sessionId
      const sessionId = Array.isArray(rawId) ? rawId[0] : rawId
      if (sessionId === undefined || sessionId.length === 0) {
        sendJson(res, 400, { error: 'sessionId is required' })
        return
      }
      const summary = telemetry.getSessionSummary(sessionId)
      const recentEvents = telemetry.getRecentEvents(50, sessionId)
      sendJson(res, 200, { summary, recentEvents })
    }),
  )

  router.get(
    '/events',
    wrapAsync(async (req, res) => {
      const limit = parsePositiveInt(req.query.limit, 100, 2000)
      const sessionId =
        typeof req.query.sessionId === 'string' && req.query.sessionId.length > 0
          ? req.query.sessionId
          : undefined
      let type: TelemetryEventType | undefined
      if (typeof req.query.type === 'string' && req.query.type.length > 0) {
        if (!isAllowedTelemetryEventType(req.query.type)) {
          sendJson(res, 400, { error: `Invalid type; use one of: ${TELEMETRY_EVENT_TYPES.join(', ')}` })
          return
        }
        type = req.query.type
      }
      const events = telemetry.getRecentEvents(limit, sessionId, type)
      sendJson(res, 200, events)
    }),
  )

  router.get(
    '/prompts',
    wrapAsync(async (_req, res) => {
      sendJson(res, 200, {
        activeVersion: promptRegistry.getActive(),
        history: promptRegistry.getVersionHistory().slice(0, 10),
        stats: telemetry.getSystemStats(),
      })
    }),
  )

  router.get(
    '/experiments',
    wrapAsync(async (_req, res) => {
      const actives = promptExperiments.listActiveExperiments()
      const withAnalysis = actives.map((exp) => {
        try {
          const currentAnalysis = promptExperiments.analyseExperiment(exp.id)
          return { ...exp, currentAnalysis }
        } catch {
          return { ...exp, currentAnalysis: null as null }
        }
      })
      sendJson(res, 200, withAnalysis)
    }),
  )

  router.post(
    '/regression-tests',
    wrapAsync(async (req, res) => {
      const now = Date.now()
      if (now - lastRegressionRunAt < REGRESSION_COOLDOWN_MS) {
        const retryAfterSec = Math.ceil((REGRESSION_COOLDOWN_MS - (now - lastRegressionRunAt)) / 1000)
        res.setHeader('Retry-After', String(retryAfterSec))
        sendJson(res, 429, {
          error: `Regression tests may run at most once per ${String(REGRESSION_COOLDOWN_MS / 1000)} seconds.`,
        })
        return
      }
      lastRegressionRunAt = now
      const categories = parseRegressionCategories(req.body)
      const result = await runRegressionTests(categories !== undefined ? { categories } : {})
      sendJson(res, 200, result)
    }),
  )

  router.post(
    '/rollback',
    wrapAsync(async (req, res) => {
      const adminKey = process.env.JARVIS_ADMIN_KEY?.trim()
      if (adminKey === undefined || adminKey.length === 0) {
        sendJson(res, 503, { error: 'JARVIS_ADMIN_KEY is not configured on the server.' })
        return
      }
      const headerVal = req.get('x-jarvis-admin')
      if (headerVal !== adminKey) {
        sendJson(res, 401, { error: 'Unauthorized: invalid or missing X-Jarvis-Admin header.' })
        return
      }
      const parsed = parseRollbackSteps(req.body)
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error })
        return
      }
      const { steps } = parsed
      try {
        const rolledBackTo = promptRegistry.rollback(steps)
        sendJson(res, 200, { rolledBackTo })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        sendJson(res, 400, { error: msg })
      }
    }),
  )

  return router
}

export default createHealthDashboardRouter
