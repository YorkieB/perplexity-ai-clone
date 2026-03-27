/**
 * LLM-backed expansion of {@link BranchCandidate}s for the Tree-of-Thoughts engine.
 *
 * @module reasoning/branchGenerator
 */

import OpenAI from 'openai'

import { buildScratchpadSummary } from './cotScratchpad'
import { scratchpadStore } from './scratchpadStore'
import {
  TOT_DEFAULTS,
  createTree,
  getNodePath,
  type BranchCandidate,
  type ThoughtNode,
  type ToTTree,
} from './totTypes'

const LOG = '[BranchGenerator]'

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'with',
  'this',
  'that',
  'from',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'not',
  'but',
  'if',
  'then',
  'than',
  'so',
  'such',
  'at',
  'it',
  'its',
  'we',
  'you',
  'they',
  'their',
  'our',
  'your',
])

function extractJsonObject(text: string): string {
  const t = text.trim()
  if (!t.startsWith('```')) {
    return t
  }
  const firstNl = t.indexOf('\n')
  const close = firstNl >= 0 ? t.indexOf('```', firstNl + 1) : -1
  if (firstNl >= 0 && close > firstNl) {
    return t.slice(firstNl + 1, close).trim()
  }
  return t
}

function tokenizeForOverlap(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  return new Set(words)
}

/** Jaccard similarity on word sets from approach + thought. */
function candidateSimilarity(a: BranchCandidate, b: BranchCandidate): number {
  const ta = tokenizeForOverlap(`${a.approach} ${a.thought}`)
  const tb = tokenizeForOverlap(`${b.approach} ${b.thought}`)
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const w of ta) {
    if (tb.has(w)) inter++
  }
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

function normalizeCandidate(raw: unknown): BranchCandidate | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const approach = typeof o.approach === 'string' ? o.approach.trim() : ''
  const thought = typeof o.thought === 'string' ? o.thought.trim() : ''
  if (approach.length === 0 || thought.length === 0) return null

  const keyAssumptions: string[] = []
  if (Array.isArray(o.keyAssumptions)) {
    for (const x of o.keyAssumptions) {
      if (typeof x === 'string' && x.trim().length > 0) keyAssumptions.push(x.trim())
    }
  }

  const riskFactors: string[] = []
  if (Array.isArray(o.riskFactors)) {
    for (const x of o.riskFactors) {
      if (typeof x === 'string' && x.trim().length > 0) riskFactors.push(x.trim())
    }
  }

  let estimatedSteps = 1
  if (typeof o.estimatedSteps === 'number' && Number.isFinite(o.estimatedSteps)) {
    estimatedSteps = Math.max(1, Math.min(5, Math.round(o.estimatedSteps)))
  }

  return {
    approach,
    thought,
    keyAssumptions,
    estimatedSteps,
    riskFactors,
  }
}

function parseBranchCandidates(content: string, expectedMax: number): BranchCandidate[] {
  try {
    const raw = extractJsonObject(content)
    const parsed: unknown = JSON.parse(raw)

    let rows: unknown[]
    if (Array.isArray(parsed)) {
      rows = parsed
    } else if (parsed !== null && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>
      const b = o.branches ?? o.candidates
      rows = Array.isArray(b) ? b : []
    } else {
      return []
    }

    const out: BranchCandidate[] = []
    for (const row of rows) {
      const c = normalizeCandidate(row)
      if (c !== null) out.push(c)
      if (out.length >= expectedMax) break
    }
    return out
  } catch {
    return []
  }
}

function fallbackCandidate(taskDescription: string): BranchCandidate {
  return {
    approach: 'Direct execution',
    thought: taskDescription,
    keyAssumptions: [],
    estimatedSteps: 1,
    riskFactors: [],
  }
}

/**
 * Calls OpenAI to propose distinct {@link BranchCandidate} lines for ToT expansion.
 */
export default class BranchGenerator {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Chat model id (default `gpt-4o`).
   */
  constructor(model: string = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Produces up to `count` diverse branch candidates below `parentNode` (root when `null`).
   */
  async generateBranches(
    taskDescription: string,
    taskType: string,
    parentNode: ThoughtNode | null,
    tree: ToTTree,
    sessionId: string,
    count: number = TOT_DEFAULTS.BRANCH_FACTOR,
  ): Promise<BranchCandidate[]> {
    const pathContext = parentNode
      ? getNodePath(tree, parentNode.id)
          .map((n) => `Depth ${String(n.depth)}: ${n.approach}`)
          .join('\n')
      : 'Root — no prior path'

    const pad = scratchpadStore.getForSession(sessionId)
    const padContext = pad !== null ? buildScratchpadSummary(pad) : ''

    const deadEnds =
      pad !== null && pad.deadEnds.length > 0
        ? pad.deadEnds.map((d) => `AVOID: ${d.approach} (${d.avoidanceHint})`).join('\n')
        : ''

    const pathBlock = parentNode !== null ? `Current path:\n${pathContext}\n` : ''
    const deadBlock = deadEnds.length > 0 ? `FAILED APPROACHES TO AVOID:\n${deadEnds}\n` : ''

    const system = `You are a strategic planning agent. Generate ${String(count)} DISTINCT candidate approaches to solve a task.

Rules:
- Each approach must be genuinely different (different strategy, not just different wording)
- Each approach must be specific enough to execute
- Acknowledge real trade-offs honestly
- If prior approaches failed, do NOT repeat them

Task type: ${taskType}
${pathBlock}${deadBlock}
Return ONLY valid JSON with this exact shape (array may have up to ${String(count)} items):
{"branches":[
  {
    "approach": "short label e.g. 'Direct implementation with X'",
    "thought": "2–4 sentence reasoning for this approach",
    "keyAssumptions": ["assumption 1", "assumption 2"],
    "estimatedSteps": 1,
    "riskFactors": ["risk 1", "risk 2"]
  }
]}
estimatedSteps must be an integer from 1 to 5.`

    const userParts = [`Task: ${taskDescription}`, '']
    if (padContext.length > 0) {
      userParts.push(padContext, '')
    }
    userParts.push(`Generate ${String(count)} distinct approaches.`)

    const user = userParts.join('\n')

    let candidates: BranchCandidate[] = []
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim() ?? ''
      candidates = parseBranchCandidates(text, count)
    } catch (err: unknown) {
      console.warn(`${LOG} Generation failed, returning fallback branch`, err)
      return [fallbackCandidate(taskDescription)]
    }

    if (candidates.length === 0) {
      console.warn(`${LOG} Generation failed, returning fallback branch`)
      return [fallbackCandidate(taskDescription)]
    }

    const beforeDedup = candidates.length
    candidates = this._filterDuplicateApproaches(candidates, TOT_DEFAULTS.MIN_NOVELTY)
    const removed = beforeDedup - candidates.length
    if (removed > 0) {
      console.log(`${LOG} Removed ${String(removed)} duplicate branches`)
    }

    if (candidates.length === 0) {
      console.warn(`${LOG} Generation failed, returning fallback branch`)
      return [fallbackCandidate(taskDescription)]
    }

    const depth = parentNode !== null ? parentNode.depth + 1 : 0
    console.log(`${LOG} Generated ${String(candidates.length)} branches for depth ${String(depth)}`)

    return candidates.slice(0, count)
  }

  /**
   * Root-level branch generation (empty path, ephemeral {@link ToTTree} shell for API consistency).
   */
  async generateRootBranches(
    taskDescription: string,
    taskType: string,
    sessionId: string,
    count: number,
  ): Promise<BranchCandidate[]> {
    const tree = createTree(sessionId, taskType, taskDescription)
    return this.generateBranches(taskDescription, taskType, null, tree, sessionId, count)
  }

  /**
   * Drops candidates whose approach+thought text is too similar to an earlier kept candidate (Jaccard on tokens).
   */
  private _filterDuplicateApproaches(
    candidates: BranchCandidate[],
    noveltyThreshold: number,
  ): BranchCandidate[] {
    const cutoff = 1 - noveltyThreshold
    const kept: BranchCandidate[] = []

    for (const c of candidates) {
      let duplicate = false
      for (const k of kept) {
        if (candidateSimilarity(c, k) > cutoff) {
          duplicate = true
          break
        }
      }
      if (!duplicate) {
        kept.push(c)
      }
    }

    return kept
  }
}
