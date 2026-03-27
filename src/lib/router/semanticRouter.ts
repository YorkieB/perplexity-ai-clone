/**
 * Embedding-based semantic intent router: hard overrides first, then cosine similarity
 * against precomputed route utterance embeddings (OpenAI).
 */

import OpenAI from 'openai'

import { addUtterancesToRoute, getRouteByName, ROUTE_DEFINITIONS, type RouteDefinition } from './utteranceLibrary'
import { applyOverrides } from './overrideRules'

const LOG = '[SemanticRouter]'

/** Cosine-similarity band for priority tie-breaking (see {@link SemanticRouter.classify}). */
const PRIORITY_TIE_EPSILON = 0.03

/** Max utterances per OpenAI embeddings request (safety batching). */
const EMBED_BATCH_SIZE = 100

/** Minimum cosine similarity to accept an embedding winner; otherwise `knowledge_lookup`. */
export const SIMILARITY_THRESHOLD = 0.72

/** OpenAI embedding model id for route and query vectors. */
export const EMBED_MODEL = 'text-embedding-3-small'

const FALLBACK_ROUTE = 'knowledge_lookup'

/** Outcome of {@link SemanticRouter.classify}. */
export interface RouteResult {
  route: string
  /** Best similarity or override confidence, in [0, 1]. */
  confidence: number
  /** How the route was chosen. */
  method: 'override' | 'embedding' | 'fallback'
  /** Utterance that best matched the query for the winning route (embedding path). */
  matchedUtterance?: string
  /** Per-route best cosine scores (embedding / fallback-with-scores paths). */
  scores?: Record<string, number>
  /** Wall-clock time for this classification. */
  processingTimeMs: number
}

interface RouteScoreRow {
  routeName: string
  score: number
  bestUtteranceIndex: number
}

function priorityForRoute(name: string): number {
  return getRouteByName(name)?.priority ?? 0
}

/**
 * Lazily initialises route embeddings, applies overrides, then scores the query embedding.
 */
export default class SemanticRouter {
  private readonly routeEmbeddings: Map<string, number[][]> = new Map()
  private readonly openai: OpenAI
  private isInitialised = false
  private initPromise: Promise<void> | null = null

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  }

  /**
   * True after {@link init} has finished building route embeddings (embedding path is usable).
   */
  getRouterInitialised(): boolean {
    return this.isInitialised
  }

  /**
   * Precomputes embeddings for every utterance in {@link ROUTE_DEFINITIONS}.
   * Idempotent; concurrent callers share one in-flight promise.
   */
  async init(): Promise<void> {
    if (this.isInitialised) {
      return
    }
    if (this.initPromise !== null) {
      await this.initPromise
      return
    }
    this.initPromise = (async () => {
      await this._buildRouteEmbeddings()
      this.isInitialised = true
      const totalUtterances = Array.from(this.routeEmbeddings.values()).reduce((s, v) => s + v.length, 0)
      console.info(
        `${LOG} Initialised with ${String(ROUTE_DEFINITIONS.length)} routes, ${String(totalUtterances)} utterances total`,
      )
    })()
    try {
      await this.initPromise
    } catch (err) {
      this.initPromise = null
      throw err
    }
  }

  /**
   * Embeds all library utterances per route and fills {@link SemanticRouter.routeEmbeddings}.
   */
  private async _buildRouteEmbeddings(): Promise<void> {
    for (const route of ROUTE_DEFINITIONS) {
      const { name, utterances } = route
      if (utterances.length === 0) {
        this.routeEmbeddings.set(name, [])
        continue
      }
      try {
        const vectors = await this._embedBatch(utterances)
        this.routeEmbeddings.set(name, vectors)
        console.info(`${LOG} Embedding route: ${name} (${String(utterances.length)} utterances)`)
      } catch (err) {
        console.warn(`${LOG} Failed to embed route "${name}"`, err)
        this.routeEmbeddings.set(name, [])
      }
    }
  }

  private async _embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const slice = texts.slice(i, i + EMBED_BATCH_SIZE)
      const res = await this.openai.embeddings.create({
        model: EMBED_MODEL,
        input: slice,
      })
      const sorted = [...res.data].sort((a, b) => a.index - b.index)
      for (const row of sorted) {
        out.push([...row.embedding])
      }
    }
    return out
  }

  private _scoreAllRoutes(queryEmbedding: number[]): {
    scores: Record<string, number>
    rows: RouteScoreRow[]
    bestScore: number
  } {
    const scores: Record<string, number> = {}
    const rows: RouteScoreRow[] = []
    let bestScore = 0

    for (const route of ROUTE_DEFINITIONS) {
      const embeddings = this.routeEmbeddings.get(route.name) ?? []
      if (embeddings.length === 0) {
        scores[route.name] = 0
        continue
      }
      let best = 0
      let bestIdx = 0
      for (let i = 0; i < embeddings.length; i++) {
        const sim = this._cosineSimilarity(queryEmbedding, embeddings[i]!)
        if (sim > best) {
          best = sim
          bestIdx = i
        }
      }
      scores[route.name] = best
      rows.push({ routeName: route.name, score: best, bestUtteranceIndex: bestIdx })
      if (best > bestScore) {
        bestScore = best
      }
    }
    return { scores, rows, bestScore }
  }

  private _winnerFromScores(rows: RouteScoreRow[], bestScore: number): {
    routeName: string
    score: number
    matchedUtterance?: string
  } {
    const band = rows.filter((r) => r.score >= bestScore - PRIORITY_TIE_EPSILON)
    band.sort((a, b) => {
      const dp = priorityForRoute(b.routeName) - priorityForRoute(a.routeName)
      if (dp !== 0) {
        return dp
      }
      return b.score - a.score
    })
    const winner = band[0]!
    const def: RouteDefinition | undefined = getRouteByName(winner.routeName)
    return {
      routeName: winner.routeName,
      score: winner.score,
      matchedUtterance: def?.utterances[winner.bestUtteranceIndex],
    }
  }

  /**
   * Classify a user message: overrides → query embedding → per-route max cosine similarity.
   */
  async classify(message: string): Promise<RouteResult> {
    const t0 = performance.now()
    const elapsed = (): number => Math.round(performance.now() - t0)

    const fallback = (confidence = 0, scores?: Record<string, number>): RouteResult => ({
      route: FALLBACK_ROUTE,
      confidence,
      method: 'fallback',
      scores,
      processingTimeMs: elapsed(),
    })

    try {
      if (!this.isInitialised) {
        try {
          await this.init()
        } catch (err) {
          console.warn(`${LOG} Init failed`, err)
        }
      }

      const override = applyOverrides(message)
      if (override !== null) {
        return {
          route: override.route,
          confidence: override.confidence,
          method: 'override',
          processingTimeMs: elapsed(),
        }
      }

      let queryEmbedding: number[]
      try {
        queryEmbedding = await this._embedSingle(message)
      } catch (err) {
        console.warn(`${LOG} Embedding failed, using fallback route`, err)
        return fallback(0)
      }

      const { scores, rows, bestScore } = this._scoreAllRoutes(queryEmbedding)

      if (bestScore < SIMILARITY_THRESHOLD) {
        return fallback(bestScore, scores)
      }

      const w = this._winnerFromScores(rows, bestScore)
      return {
        route: w.routeName,
        confidence: w.score,
        method: 'embedding',
        matchedUtterance: w.matchedUtterance,
        scores,
        processingTimeMs: elapsed(),
      }
    } catch (err) {
      console.warn(`${LOG} Embedding failed, using fallback route`, err)
      return fallback(0)
    }
  }

  private async _embedSingle(text: string): Promise<number[]> {
    const res = await this.openai.embeddings.create({
      model: EMBED_MODEL,
      input: text,
    })
    const row = res.data[0]
    if (row === undefined) {
      throw new Error('empty embedding response')
    }
    return [...row.embedding]
  }

  /**
   * Cosine similarity in [0, 1] for non-negative typical embeddings; returns 0 if either vector is zero-length.
   */
  private _cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0
    }
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!
      const y = b[i]!
      dot += x * y
      na += x * x
      nb += y * y
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb)
    if (denom === 0 || !Number.isFinite(denom)) {
      return 0
    }
    const c = dot / denom
    if (!Number.isFinite(c)) {
      return 0
    }
    return c
  }

  /**
   * Extends both the utterance library and this router's embeddings for a route.
   */
  async addUtterances(routeName: string, utterances: string[]): Promise<void> {
    const trimmed = utterances.map((u) => u.trim()).filter((u) => u.length > 0)
    if (trimmed.length === 0) {
      return
    }
    try {
      await this.init()
    } catch {
      // proceed: library still updated; embed may fail below
    }
    addUtterancesToRoute(routeName, trimmed)
    try {
      const newVecs = await this._embedBatch(trimmed)
      const existing = this.routeEmbeddings.get(routeName) ?? []
      this.routeEmbeddings.set(routeName, [...existing, ...newVecs])
      console.info(`${LOG} Added ${String(trimmed.length)} utterances to route: ${routeName.trim()}`)
    } catch (err) {
      console.warn(`${LOG} Embedding failed while adding utterances`, err)
    }
  }

  /** Route name → number of embedded utterances currently stored. */
  getRouteStats(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [name, vecs] of this.routeEmbeddings.entries()) {
      out[name] = vecs.length
    }
    for (const r of ROUTE_DEFINITIONS) {
      if (out[r.name] === undefined) {
        out[r.name] = 0
      }
    }
    return out
  }
}

/** Shared router instance for the app. */
export const semanticRouter = new SemanticRouter()
