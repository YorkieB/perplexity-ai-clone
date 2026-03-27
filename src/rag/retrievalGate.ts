/**
 * Retrieval gate for Jarvis: chooses session vs long-term memory vs none, and whether
 * the pipeline may search the web, based on intent route and similarity scores.
 */

import type SessionIndex from '@/memory/sessionIndex'

import type { LongTermQueryResult, LongTermChunk } from './longTermIndex'

export type { LongTermQueryResult, LongTermChunk }

/**
 * Pluggable long-term vector / RAG index. Implemented separately; the gate only calls
 * {@link LongTermIndex.query}.
 */
export interface LongTermIndex {
  query(message: string, topK?: number): LongTermQueryResult | Promise<LongTermQueryResult>
}

/** Where retrieved evidence came from. `session_fallback` is below session hit threshold but still has usable context. */
export type RetrievalGateSource = 'session' | 'session_fallback' | 'long_term' | 'none'

export interface GateResult {
  source: RetrievalGateSource
  content: string[]
  bestScore: number
  shouldSearchWeb: boolean
  explanation: string
}

const SESSION_HIT_THRESHOLD = 0.82
const LONG_TERM_KNOWLEDGE_HIT_THRESHOLD = 0.75
const SESSION_QUERY_TOP_K = 8
const LONG_TERM_QUERY_TOP_K = 8

function isBlank(s: string): boolean {
  return !s || !s.trim()
}

async function resolveLongTermQuery(
  index: LongTermIndex,
  message: string,
  topK = LONG_TERM_QUERY_TOP_K,
): Promise<LongTermQueryResult> {
  const raw = index.query(message, topK)
  const resolved = await Promise.resolve(raw)
  const metadatas = Array.isArray(resolved.metadatas) ? resolved.metadatas : []
  return { ...resolved, metadatas }
}

/**
 * Routes retrieval and web-search permission for a user message given an intent label.
 */
export default class RetrievalGate {
  /**
   * @param sessionIndex - Ephemeral session vector index (must be the same instance Jarvis indexes).
   * @param longTermIndex - Persistent or workspace RAG index (may be a no-op stub until wired).
   */
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly longTermIndex: LongTermIndex,
  ) {}

  /**
   * Collects the latest code / text artifacts from the session index when vector query
   * returns no ranked chunks (fallback path for code / clarification intents).
   */
  private collectSessionLatestFallback(): string[] {
    const out: string[] = []
    const code = this.sessionIndex.getLatestCode()
    if (code && code.trim()) out.push(code.trim())
    for (const t of ['text', 'output', 'analysis'] as const) {
      const row = this.sessionIndex.getLatestArtifactByType(t)
      const c = row?.content
      if (typeof c === 'string' && c.trim()) out.push(c.trim())
    }
    return [...new Set(out)]
  }

  /**
   * Runs session query and normalises failures to an empty miss (no throw to callers).
   */
  private async safeSessionQuery(userMessage: string): Promise<{
    hit: boolean
    chunks: string[]
    bestScore: number
  }> {
    try {
      return await this.sessionIndex.query(userMessage.trim(), SESSION_QUERY_TOP_K)
    } catch {
      return { hit: false, chunks: [], bestScore: 0 }
    }
  }

  /**
   * Branch for `code_instruction` and `clarification_needed`. Never sets `shouldSearchWeb: true`.
   */
  private async checkCodeOrClarification(userMessage: string): Promise<GateResult> {
    const session = await this.safeSessionQuery(userMessage)

    if (session.hit && session.bestScore >= SESSION_HIT_THRESHOLD) {
      return {
        source: 'session',
        content: session.chunks,
        bestScore: session.bestScore,
        shouldSearchWeb: false,
        explanation: 'Session index hit above threshold; use in-context code or recent turns.',
      }
    }

    if (session.chunks.length > 0) {
      return {
        source: 'session_fallback',
        content: session.chunks,
        bestScore: session.bestScore,
        shouldSearchWeb: false,
        explanation: 'Session below hit threshold but ranked chunks available; prefer clarification over web.',
      }
    }

    const latest = this.collectSessionLatestFallback()
    if (latest.length > 0) {
      return {
        source: 'session_fallback',
        content: latest,
        bestScore: 0,
        shouldSearchWeb: false,
        explanation: 'No ranked session matches; using latest code/text artifacts from this session.',
      }
    }

    let lt: LongTermQueryResult
    try {
      lt = await resolveLongTermQuery(this.longTermIndex, userMessage.trim())
    } catch {
      lt = { hit: false, chunks: [], bestScore: 0, metadatas: [] }
    }

    if (lt.hit && lt.chunks.length > 0) {
      return {
        source: 'long_term',
        content: lt.chunks,
        bestScore: lt.bestScore,
        shouldSearchWeb: false,
        explanation: 'Long-term index matched; no fresh session context.',
      }
    }

    return {
      source: 'none',
      content: [],
      bestScore: 0,
      shouldSearchWeb: false,
      explanation: 'No shared content found - ask for clarification',
    }
  }

  /**
   * Branch for `knowledge_lookup`. Web search allowed only when long-term does not clear the bar.
   */
  private async checkKnowledgeLookup(userMessage: string): Promise<GateResult> {
    let lt: LongTermQueryResult
    try {
      lt = await resolveLongTermQuery(this.longTermIndex, userMessage.trim())
    } catch {
      lt = { hit: false, chunks: [], bestScore: 0, metadatas: [] }
    }

    const strong =
      lt.hit && lt.bestScore >= LONG_TERM_KNOWLEDGE_HIT_THRESHOLD && lt.chunks.length > 0

    if (strong) {
      return {
        source: 'long_term',
        content: lt.chunks,
        bestScore: lt.bestScore,
        shouldSearchWeb: false,
        explanation: 'Long-term knowledge hit (score meets knowledge threshold).',
      }
    }

    return {
      source: 'none',
      content: [],
      bestScore: lt.bestScore,
      shouldSearchWeb: true,
      explanation: 'No strong long-term hit; allow web search for factual lookup.',
    }
  }

  /**
   * Decide retrieval source and whether downstream logic may search the web.
   *
   * @param userMessage - Latest user utterance (trimmed inside).
   * @param intentRoute - Intent label from the router (e.g. `code_instruction`, `knowledge_lookup`).
   * @returns Gate result; callers must `await` because session query uses async embeddings.
   */
  async check(userMessage: string, intentRoute: string): Promise<GateResult> {
    if (isBlank(userMessage)) {
      return {
        source: 'none',
        content: [],
        bestScore: 0,
        shouldSearchWeb: false,
        explanation: 'Empty user message; nothing to retrieve.',
      }
    }

    const route = intentRoute.trim()

    if (route === 'code_instruction' || route === 'clarification_needed') {
      return this.checkCodeOrClarification(userMessage)
    }

    if (route === 'knowledge_lookup') {
      return this.checkKnowledgeLookup(userMessage)
    }

    if (route === 'conversational') {
      return {
        source: 'none',
        content: [],
        bestScore: 0,
        shouldSearchWeb: false,
        explanation: 'Conversational intent; retrieval and web search not required by gate.',
      }
    }

    if (route === 'voice_task') {
      return {
        source: 'none',
        content: [],
        bestScore: 0,
        shouldSearchWeb: false,
        explanation: 'Voice synthesis or tuning intent; web search not required by gate.',
      }
    }

    return {
      source: 'none',
      content: [],
      bestScore: 0,
      shouldSearchWeb: true,
      explanation: 'Unknown intent route; defaulting to allow web search.',
    }
  }
}
