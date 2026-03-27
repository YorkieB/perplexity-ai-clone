/**
 * Tree-of-Thoughts value function: scores {@link ThoughtNode} branches for search.
 *
 * @module reasoning/branchScorer
 */

import OpenAI from 'openai'

import type { Lesson } from './lessonsStore'
import { lessonsStore } from './lessonsStore'
import { getNodePath, type ThoughtNode, type ToTTree } from './totTypes'
import { scratchpadStore } from './scratchpadStore'

const LOG = '[BranchScorer]'

const ALIGN_STOP = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'have',
  'has',
  'are',
  'was',
  'were',
  'not',
  'but',
  'can',
  'should',
  'must',
  'will',
  'all',
  'any',
  'use',
  'your',
  'into',
  'than',
  'then',
  'also',
  'only',
  'such',
  'each',
  'which',
  'their',
  'when',
  'what',
  'how',
  'does',
  'did',
  'been',
  'being',
  'about',
  'there',
  'here',
  'some',
  'more',
  'very',
  'just',
  'like',
  'make',
  'sure',
  'always',
  'never',
])

/**
 * Inputs needed to score a branch against the live task.
 */
export interface ScoringContext {
  taskDescription: string
  taskType: string
  sessionId: string
  requirements: string[]
  /** RAG or other retrieved snippets. */
  availableContext: string[]
}

/**
 * Per-dimension scores plus weighted aggregate from {@link BranchScorer}.
 */
export interface ScoreBreakdown {
  feasibility: number
  completeness: number
  novelty: number
  lessonAlignment: number
  composite: number
  rationale: string
}

/** Weights for {@link ScoreBreakdown.composite}. Sum is `1`. */
export const SCORE_WEIGHTS = {
  feasibility: 0.35,
  completeness: 0.35,
  novelty: 0.15,
  lessonAlignment: 0.15,
} as const

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !ALIGN_STOP.has(w))
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text))
}

/** Max Jaccard similarity between this node and any sibling (approach + thought). */
function maxSiblingOverlap(node: ThoughtNode, siblings: ThoughtNode[]): number {
  const a = tokenSet(`${node.approach} ${node.thought}`)
  if (a.size === 0) return 0
  let maxSim = 0
  for (const sib of siblings) {
    if (sib.id === node.id) continue
    const b = tokenSet(`${sib.approach} ${sib.thought}`)
    if (b.size === 0) continue
    let inter = 0
    for (const w of a) {
      if (b.has(w)) inter++
    }
    const union = a.size + b.size - inter
    const j = union === 0 ? 0 : inter / union
    if (j > maxSim) maxSim = j
  }
  return maxSim
}

function computeNovelty(node: ThoughtNode, siblings: ThoughtNode[]): number {
  const maxOv = maxSiblingOverlap(node, siblings)
  return clamp01(1 - maxOv)
}

/**
 * Fraction of salient lesson tokens that appear in the branch text (proxy for “follows lesson”).
 */
function lessonMatchesBranch(lesson: Lesson, branchLower: string): boolean {
  const words = tokenize(lesson.lesson)
  if (words.length === 0) return true
  let hits = 0
  for (const w of words) {
    if (branchLower.includes(w)) hits++
  }
  return hits / words.length >= 0.35 || hits >= 2
}

async function computeLessonAlignment(node: ThoughtNode, context: ScoringContext): Promise<number> {
  const lessons = await lessonsStore.getRelevantLessons({
    sessionId: context.sessionId,
    taskType: context.taskType,
    currentOutput: `${node.approach}\n${node.thought}`.slice(0, 500),
  })
  if (lessons.length === 0) return 1
  const branchLower = `${node.approach} ${node.thought}`.toLowerCase()
  let match = 0
  for (const L of lessons) {
    if (lessonMatchesBranch(L, branchLower)) match++
  }
  return clamp01(match / lessons.length)
}

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

function asStringArrayMeta(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
}

function compositeScore(
  feasibility: number,
  completeness: number,
  novelty: number,
  lessonAlignment: number,
): number {
  return clamp01(
    feasibility * SCORE_WEIGHTS.feasibility +
      completeness * SCORE_WEIGHTS.completeness +
      novelty * SCORE_WEIGHTS.novelty +
      lessonAlignment * SCORE_WEIGHTS.lessonAlignment,
  )
}

/**
 * OpenAI-backed feasibility/completeness plus local novelty and lesson heuristics.
 */
export default class BranchScorer {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Small chat model (default `gpt-4o-mini`) for high call volume.
   */
  constructor(model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Scores one node, mutates {@link ThoughtNode.score}, feasibility fields, and `status`.
   */
  async scoreNode(
    node: ThoughtNode,
    siblings: ThoughtNode[],
    tree: ToTTree,
    context: ScoringContext,
  ): Promise<ScoreBreakdown> {
    const pad = scratchpadStore.getForSession(context.sessionId)
    const approachNorm = node.approach.trim()
    if (pad !== null) {
      for (const d of pad.deadEnds) {
        if (d.approach.trim() === approachNorm) {
          const breakdown: ScoreBreakdown = {
            feasibility: 0,
            completeness: 0,
            novelty: computeNovelty(node, siblings),
            lessonAlignment: await computeLessonAlignment(node, context),
            composite: 0,
            rationale: 'Approach matches a recorded dead end; branch pre-screened.',
          }
          node.score = 0
          node.feasibility = 0
          node.completeness = 0
          node.novelty = breakdown.novelty
          node.status = 'scored'
          console.log(`${LOG} Node pre-screened — matches dead end`)
          return breakdown
        }
      }
    }

    const novelty = computeNovelty(node, siblings)
    const lessonAlignment = await computeLessonAlignment(node, context)

    const keyAssumptions = asStringArrayMeta(node.metadata.keyAssumptions)
    const riskFactors = asStringArrayMeta(node.metadata.riskFactors)

    const pathLine = getNodePath(tree, node.id)
      .map((n) => n.approach)
      .join(' → ')

    const contextBlock =
      context.availableContext.length > 0
        ? `\nContext snippets:\n${context.availableContext.map((c) => c.slice(0, 800)).join('\n---\n')}`
        : ''

    const user = `Task: ${context.taskDescription}
Requirements: ${context.requirements.join(', ')}
Path from root: ${pathLine || '(single node)'}${contextBlock}

Approach: ${node.approach}
Reasoning: ${node.thought}

Key assumptions: ${keyAssumptions.length > 0 ? keyAssumptions.join(', ') : '(none listed)'}
Risk factors: ${riskFactors.length > 0 ? riskFactors.join(', ') : '(none listed)'}`

    const system = `You are evaluating a reasoning branch for a task.
Score TWO dimensions only:

feasibility (0.0-1.0): Can this approach realistically succeed?
  1.0 = straightforward, clear path
  0.5 = uncertain, requires assumptions
  0.0 = likely to fail or impossible

completeness (0.0-1.0): Does it fully address ALL requirements?
  1.0 = addresses everything
  0.5 = addresses main goal, misses some requirements
  0.0 = only addresses part of the task

Return ONLY valid JSON:
{"feasibility": 0.0, "completeness": 0.0, "rationale": "brief reason"}`

    let feasibility = 0.5
    let completeness = 0.5
    let rationale = 'LLM scoring failed; using default feasibility/completeness.'

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim() ?? ''
      const raw = extractJsonObject(text)
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>
        if (typeof o.feasibility === 'number' && Number.isFinite(o.feasibility)) {
          feasibility = clamp01(o.feasibility)
        }
        if (typeof o.completeness === 'number' && Number.isFinite(o.completeness)) {
          completeness = clamp01(o.completeness)
        }
        if (typeof o.rationale === 'string' && o.rationale.trim().length > 0) {
          rationale = o.rationale.trim()
        }
      }
    } catch (err: unknown) {
      console.warn(`${LOG} LLM scoring failed, using defaults`, err)
    }

    const composite = compositeScore(feasibility, completeness, novelty, lessonAlignment)

    node.score = composite
    node.feasibility = feasibility
    node.completeness = completeness
    node.novelty = novelty
    node.status = 'scored'

    console.log(
      `${LOG} Node ${node.id.slice(0, 8)} scored: ${composite.toFixed(2)} (F:${feasibility.toFixed(2)} C:${completeness.toFixed(2)})`,
    )

    return {
      feasibility,
      completeness,
      novelty,
      lessonAlignment,
      composite,
      rationale,
    }
  }

  /**
   * Scores many nodes concurrently; novelty for each uses same-depth peers in `nodes`.
   */
  async scoreBatch(
    nodes: ThoughtNode[],
    tree: ToTTree,
    context: ScoringContext,
  ): Promise<Map<string, ScoreBreakdown>> {
    const entries = await Promise.all(
      nodes.map(async (node) => {
        const siblings = nodes.filter((n) => n.id !== node.id && n.depth === node.depth)
        const breakdown = await this.scoreNode(node, siblings, tree, context)
        return [node.id, breakdown] as const
      }),
    )
    console.log(`${LOG} Batch scored ${String(nodes.length)} nodes`)
    return new Map(entries)
  }
}
