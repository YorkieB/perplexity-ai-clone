/**
 * Corrective RAG (CRAG): LLM judges which retrieved chunks are relevant to the user query.
 */

import { z } from 'zod'

import { callLlm } from '@/lib/llm'

const LOG = '[LongTermCRAG]'

function extractJsonObject(raw: string): string {
  const t = raw.trim()
  if (!t.startsWith('```')) return t
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

const CragSchema = z.object({
  relevant_indices: z.array(z.number().int().nonnegative()).optional(),
  relevance_scores: z.record(z.string(), z.number()).optional(),
})

export interface CragCandidate {
  readonly index: number
  readonly preview: string
}

export interface CragResult {
  /** Per candidate index (0..n-1 in the batch), relevance in [0, 1] when CRAG ran. */
  readonly relevanceByIndex: Map<number, number>
  /** False when the LLM call failed or JSON was invalid — caller should keep all candidates. */
  readonly applied: boolean
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…`
}

/**
 * Ask GPT-4o-mini (or `model`) which candidate chunks are relevant; returns scores for merging with hybrid retrieval.
 */
export async function runCragRelevanceFilter(
  userQuery: string,
  candidates: CragCandidate[],
  model: string,
  logWarn: (msg: string, err?: unknown) => void,
  callLlmFn: (prompt: string, m: string, jsonMode: boolean) => Promise<string> = callLlm,
): Promise<CragResult> {
  if (candidates.length === 0) {
    return { relevanceByIndex: new Map(), applied: true }
  }

  const body = candidates
    .map((c) => `### Chunk ${String(c.index)}\n${truncate(c.preview, 1400)}`)
    .join('\n\n')

  const prompt = `You filter retrieved passages for retrieval-augmented generation (RAG).

User query:
"""${truncate(userQuery, 2000)}"""

Candidate chunks (indices are 0-based in this list only):
${body}

Return a single JSON object with:
- "relevant_indices": array of integers — indices of chunks that are **materially useful** for answering the query (not tangential).
- "relevance_scores": object mapping each index as string key to a float 0–1 (how relevant).

Be strict: omit irrelevant or duplicate chunks. If nothing helps, use an empty "relevant_indices" array.`

  try {
    const raw = await callLlmFn(prompt, model, true)
    const parsedJson: unknown = JSON.parse(extractJsonObject(raw))
    const parsed = CragSchema.safeParse(parsedJson)
    if (!parsed.success) {
      logWarn(`${LOG} CRAG JSON shape invalid`, parsed.error)
      return { relevanceByIndex: new Map(), applied: false }
    }

    const rel = new Map<number, number>()
    const idxList = parsed.data.relevant_indices ?? []
    for (const i of idxList) {
      if (i >= 0 && i < candidates.length) {
        rel.set(i, Math.max(rel.get(i) ?? 0, 0.85))
      }
    }
    const scores = parsed.data.relevance_scores ?? {}
    for (const [key, val] of Object.entries(scores)) {
      const i = Number(key)
      if (!Number.isFinite(i) || i < 0 || i >= candidates.length) continue
      const clamped = Math.max(0, Math.min(1, val))
      rel.set(i, Math.max(rel.get(i) ?? 0, clamped))
    }

    return { relevanceByIndex: rel, applied: true }
  } catch (e) {
    logWarn(`${LOG} CRAG LLM call failed`, e)
    return { relevanceByIndex: new Map(), applied: false }
  }
}

/**
 * `orderedRowIds[i]` corresponds to CRAG candidate index `i`.
 * When CRAG did not apply, returns the input unchanged.
 */
export function filterRowIdsByCragPositions(
  orderedRowIds: number[],
  crag: CragResult,
  minScore: number,
): number[] {
  if (!crag.applied) return orderedRowIds
  if (crag.relevanceByIndex.size === 0) return []
  return orderedRowIds.filter((_, position) => (crag.relevanceByIndex.get(position) ?? 0) >= minScore)
}
