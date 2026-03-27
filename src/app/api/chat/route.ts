/**
 * ORCHESTRATION HIERARCHY (HTTP chat must use the top node only)
 *
 * POST /api/chat
 *   ├── getOrchestratorForSession()    ← session restore (Map cache, then disk + hydrate)
 *   ├── schedulePersistChatSession()   ← non-blocking persist after each turn
 *   └── {@link Orchestrator} (`src/orchestrator.ts`)
 *         ├── semanticRouter + {@link RetrievalGate} (intent, session RAG / long-term, gate)
 *         ├── session {@link SessionIndex} (turn indexing, embeddings)
 *         └── {@link ManagerWorkerOrchestrator} (`src/agents/managerWorkerOrchestrator.ts`)
 *               ├── {@link ManagerAgent} (brief / clarify / direct answer)
 *               ├── pre-task confidence gate ({@link ConfidenceElicitor}.estimatePreTask)
 *               ├── ReAct + Worker + Reflexion + post-task confidence (MW routes)
 *               └── returns {@link MWOrchestratorResult}
 *
 * `Orchestrator.process(string)` returns {@link OrchestratorProcessResult} (unified reply +
 * optional `metadata` from MW path). Do not call `ManagerWorkerOrchestrator.process` from
 * this route — that skips router, retrieval gate, and duplicates nothing here beyond HTTP I/O.
 */

// ─── PRODUCTION READINESS SCOPE ──────────────────────────────────────
// READY:
//   ✅ Single-instance Node.js on DigitalOcean App Platform
//   ✅ Persistent volume mounted at /data (lessons + sessions survive restart)
//   ✅ better-sqlite3 installed on server (SQLite lessons adapter)
//   ✅ OPENAI_API_KEY set in environment variables
//
// NOT READY (future work if needed):
//   ❌ Multi-instance / horizontal scaling
//      → File-based session/lesson persistence has write race conditions
//      → Fix: swap SessionPersistenceAdapter + LessonsPersistenceAdapter
//        for Redis or PostgreSQL adapters (same interface, different backend)
//
//   ❌ Edge runtime (Vercel Edge, Cloudflare Workers)
//      → better-sqlite3 and node:crypto are Node.js only
//      → Fix: swap to Web Crypto API + Upstash Redis for edge compatibility
//
//   ❌ Multiple users / tenants
//      → Session and lesson stores have no user isolation
//      → Fix: namespace all keys by userId
//
// Current target: single-user, single-instance, Node.js, DigitalOcean.
// This covers 100% of Jarvis's current use case.
// ─────────────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server'

// crypto: named import for compatibility across Node.js versions
// (avoids relying on globalThis.crypto which requires Node 19+ or edge runtime)
import { randomUUID } from 'crypto'

import type { MWOrchestratorResult } from '@/agents/managerWorkerOrchestrator'
import { isMwOrchestratorClarificationRequired } from '@/agents/managerWorkerOrchestrator'
import type { OrchestratorProcessResult } from '@/orchestrator'
import Orchestrator from '@/orchestrator'
import {
  mwResultToAssistantPayload,
  type AssistantChatMetadata,
} from '@/lib/api/mwResultToAssistantPayload'
import { sessionPersistenceAdapter } from '@/lib/persistence/sessionPersistenceAdapter'

export const dynamic = 'force-dynamic'

/**
 * SESSION PERSISTENCE STRATEGY
 *
 * In-memory `Map`: fast path for the lifetime of the Node process.
 * Disk fallback: `data/sessions.json` (or env `JARVIS_SESSIONS_FILE`), survives restarts when the
 * data directory is on a persistent volume (e.g. DigitalOcean App Platform).
 *
 * On restart: sessions are restored from disk on first access (`getOrchestratorForSession`):
 * `sessionPersistenceAdapter.get`, then `Orchestrator.hydrateFromPersistedSession`. `contextHistory`
 * is restored and turns are re-indexed into the per-session vector index. Scratchpad / MW
 * in-memory state is not restored.
 *
 * After each successful turn, `schedulePersistChatSession` writes the snapshot (non-blocking).
 *
 * TTL: 24 hours (default in `SessionPersistenceAdapter`). Pruning runs once per process via
 * `setImmediate` on module load.
 *
 * Multi-instance: file-backed JSON is not safe for concurrent writers across instances. Jarvis is
 * assumed single-instance on DO; swap the adapter for Redis (same shape) if that changes.
 */
const orchestratorsBySessionId = new Map<string, Orchestrator>()

setImmediate(() => {
  try {
    sessionPersistenceAdapter.prune()
  } catch (err: unknown) {
    console.error('[SessionPersistence] prune on startup failed:', err)
  }
})

function getOrchestratorForSession(sessionId: string): Orchestrator {
  const cached = orchestratorsBySessionId.get(sessionId)
  if (cached !== undefined) {
    return cached
  }

  const orchestrator = new Orchestrator({ sessionId })
  const persisted = sessionPersistenceAdapter.get(sessionId)
  if (persisted !== null) {
    console.log(`[Orchestrator] Restored session ${sessionId} from disk`)
    orchestrator.hydrateFromPersistedSession(persisted)
  }
  orchestratorsBySessionId.set(sessionId, orchestrator)
  return orchestrator
}

function schedulePersistChatSession(sessionId: string, orchestrator: Orchestrator): void {
  setImmediate(() => {
    try {
      const prior = sessionPersistenceAdapter.get(sessionId)
      sessionPersistenceAdapter.save(
        orchestrator.snapshotForPersistence(prior?.createdAt ?? null),
      )
    } catch (err: unknown) {
      console.error('[POST /api/chat] Session persist failed:', err)
    }
  })
}

/**
 * HTTP chat: full Jarvis pipeline (intent → retrieval gate → Manager–Worker or RAG/tools).
 *
 * Body: `{ "message": string, "sessionId"?: string }`
 * - `sessionId` optional; when omitted, a new UUID is generated and returned in the JSON response.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body === null || typeof body !== 'object') {
      return Response.json({ error: 'Body must be a JSON object' }, { status: 400 })
    }

    const rec = body as Record<string, unknown>
    const message = rec.message
    if (message === undefined || typeof message !== 'string' || message.trim().length === 0) {
      return Response.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    let sessionId =
      typeof rec.sessionId === 'string' && rec.sessionId.trim().length > 0
        ? rec.sessionId.trim()
        : randomUUID()

    const orchestrator = getOrchestratorForSession(sessionId)
    const result = await orchestrator.process(message.trim())
    schedulePersistChatSession(sessionId, orchestrator)
    return chatJsonFromOrchestratorResult(result, { sessionId })
  } catch (err: unknown) {
    console.error('[POST /api/chat] Unhandled error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Maps {@link OrchestratorProcessResult} to the same assistant JSON shape as {@link chatJsonFromMwResult}
 * (role + content + metadata). Use for turns that went through {@link Orchestrator.process}.
 */
export function chatJsonFromOrchestratorResult(
  result: OrchestratorProcessResult,
  options?: { sessionId?: string },
): Response {
  const metadata: AssistantChatMetadata =
    result.metadata !== undefined ? result.metadata : { type: 'success' }

  return Response.json(
    {
      role: 'assistant' as const,
      content: result.reply,
      metadata,
      ...(options?.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    },
    { status: 200 },
  )
}

/**
 * Maps an MW-only orchestrator result to a 200 JSON response (tests / direct MW calls).
 */
export function chatJsonFromMwResult(result: MWOrchestratorResult): Response {
  if (isMwOrchestratorClarificationRequired(result)) {
    return Response.json(
      {
        role: 'assistant' as const,
        content: result.question,
        metadata: {
          type: 'clarification_required' as const,
          preTaskEstimate: result.preTaskEstimate ?? null,
        },
      },
      { status: 200 },
    )
  }

  return Response.json(mwResultToAssistantPayload(result), { status: 200 })
}
