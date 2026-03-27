/**
 * Corrective RAG (CRAG): per-chunk LLM relevance scoring for Jarvis retrieval.
 * Prefer {@link evaluateRetrieval} with `skipEvaluation: true` for trusted session hits.
 */

import OpenAI from 'openai'

const LOG = '[CRAG]'
const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are a retrieval relevance evaluator. Given a user query and a retrieved chunk, 
determine if the chunk is genuinely relevant to the query.
Return ONLY valid JSON: {"relevance": "relevant" | "ambiguous" | "irrelevant", "confidence": 0.0-1.0}
- relevant: chunk directly answers or strongly supports the query
- ambiguous: chunk is loosely related but may not be what the user wants
- irrelevant: chunk is clearly unrelated to the query`

/** Per-chunk LLM judgment used to build {@link EvaluatedRetrieval}. */
export interface CRAGResult {
  content: string
  relevance: 'relevant' | 'ambiguous' | 'irrelevant'
  confidence: number
}

/** Output of {@link evaluateRetrieval}: filtered chunks plus formatted context for the LLM. */
export interface EvaluatedRetrieval {
  filteredChunks: string[]
  ragContext: string
  allResults: CRAGResult[]
  hadIrrelevant: boolean
}

function logError(message: string, cause?: unknown): void {
  if (cause !== undefined) {
    console.warn(`${LOG} ${message}`, cause)
  } else {
    console.warn(`${LOG} ${message}`)
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}

function isRelevance(s: unknown): s is CRAGResult['relevance'] {
  return s === 'relevant' || s === 'ambiguous' || s === 'irrelevant'
}

function parseEvaluatorJson(raw: string): { relevance: CRAGResult['relevance']; confidence: number } | null {
  const t = raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(t.startsWith('```') ? extractJsonFromFence(t) : t) as unknown
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const rel = o.relevance
  const conf = o.confidence
  if (!isRelevance(rel)) return null
  const c = typeof conf === 'number' ? conf : Number(conf)
  return { relevance: rel, confidence: clamp01(c) }
}

function extractJsonFromFence(t: string): string {
  const lines = t.split('\n')
  if (lines.length < 2) return t
  const inner: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '```') break
    inner.push(line)
  }
  return inner.join('\n').trim() || t
}

function defaultAmbiguous(content: string): CRAGResult {
  return { content, relevance: 'ambiguous', confidence: 0.5 }
}

async function evaluateOneChunk(
  openai: OpenAI,
  query: string,
  chunk: string,
): Promise<CRAGResult> {
  const slice = chunk.slice(0, 1000)
  const userMessage = `<query>${query}</query>
<retrieved_chunk>${slice}</retrieved_chunk>`

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? ''
    const parsed = parseEvaluatorJson(raw)
    if (parsed === null) {
      logError('invalid JSON from evaluator', raw)
      return defaultAmbiguous(chunk)
    }
    return {
      content: chunk,
      relevance: parsed.relevance,
      confidence: parsed.confidence,
    }
  } catch (e) {
    logError('chunk evaluation failed', e)
    return defaultAmbiguous(chunk)
  }
}

function formatChunksWithRelevance(results: CRAGResult[]): string {
  return results
    .map((r, i) => {
      const tag = i + 1
      return `<retrieved_chunk_${String(tag)} relevance='${r.relevance}'>\n${r.content}\n</retrieved_chunk_${String(tag)}>`
    })
    .join('\n\n')
}

/**
 * Run per-chunk CRAG relevance (gpt-4o-mini), filter irrelevant, and build `ragContext` for injection.
 *
 * @param query - User query.
 * @param chunks - Retrieved text chunks (e.g. from hybrid search).
 * @param options.skipEvaluation - If true, treat every chunk as relevant (session / trusted paths).
 */
export async function evaluateRetrieval(
  query: string,
  chunks: string[],
  options?: { skipEvaluation?: boolean },
): Promise<EvaluatedRetrieval> {
  if (chunks.length === 0) {
    return {
      filteredChunks: [],
      ragContext: '',
      allResults: [],
      hadIrrelevant: false,
    }
  }

  if (options?.skipEvaluation === true) {
    const allResults: CRAGResult[] = chunks.map((content) => ({
      content,
      relevance: 'relevant',
      confidence: 1,
    }))
    return {
      filteredChunks: [...chunks],
      ragContext: formatChunksWithRelevance(allResults),
      allResults,
      hadIrrelevant: false,
    }
  }

  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    logError('OPENAI_API_KEY missing; defaulting all chunks to ambiguous')
    const allResults = chunks.map((c) => defaultAmbiguous(c))
    const filtered = allResults.filter((r) => r.relevance !== 'irrelevant').map((r) => r.content)
    return {
      filteredChunks: filtered,
      ragContext: formatChunksWithRelevance(allResults.filter((r) => r.relevance !== 'irrelevant')),
      allResults,
      hadIrrelevant: allResults.some((r) => r.relevance === 'irrelevant'),
    }
  }

  const openai = new OpenAI({ apiKey: key })
  const allResults: CRAGResult[] = []
  for (const chunk of chunks) {
    const r = await evaluateOneChunk(openai, query, chunk)
    allResults.push(r)
  }

  const filteredChunks = allResults
    .filter((r) => r.relevance === 'relevant' || r.relevance === 'ambiguous')
    .map((r) => r.content)

  const hadIrrelevant = allResults.some((r) => r.relevance === 'irrelevant')

  const ragContext = formatChunksWithRelevance(
    allResults.filter((r) => r.relevance === 'relevant' || r.relevance === 'ambiguous'),
  )

  return {
    filteredChunks,
    ragContext,
    allResults,
    hadIrrelevant,
  }
}

/**
 * Build RAG context XML without LLM calls (fast path when chunks are already vetted).
 */
export function buildRagContext(chunks: string[]): string {
  if (chunks.length === 0) return ''
  return chunks
    .map((c, i) => {
      const tag = i + 1
      return `<retrieved_chunk_${String(tag)}>\n${c}\n</retrieved_chunk_${String(tag)}>`
    })
    .join('\n\n')
}
