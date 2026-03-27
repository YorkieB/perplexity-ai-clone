/**
 * Heuristic + LLM gate for Tree-of-Thoughts: only spend on branching when complexity warrants it.
 *
 * @module reasoning/complexityDetector
 */

import OpenAI from 'openai'

import type { CoTScratchpad } from './cotScratchpad'

/**
 * Coarse bucket for routing between ReAct-only, scratchpad, and full ToT search.
 */
export type ComplexityLevel =
  | 'trivial'
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'very_complex'

/**
 * Outcome of {@link ComplexityDetector.assess}: level, score, ToT flag, and suggested beam settings.
 */
export interface ComplexityAssessment {
  level: ComplexityLevel
  /** Composite complexity in \([0, 1]\). */
  score: number
  /** `true` when {@link score} ≥ {@link COMPLEXITY_TOT_THRESHOLD}. */
  useTot: boolean
  totConfig: {
    beamWidth: number
    branchFactor: number
    maxDepth: number
  }
  reasoning: string
  signals: string[]
}

/** Tasks at or above this score are candidates for Tree-of-Thoughts. */
export const COMPLEXITY_TOT_THRESHOLD = 0.65

const CONNECTORS = [
  'and',
  'also',
  'additionally',
  'plus',
  'as well as',
  'furthermore',
  'moreover',
] as const

const ARCHITECTURAL_KEYWORDS = [
  'architecture',
  'design',
  'structure',
  'system',
  'refactor',
  'migrate',
  'integrate',
  'redesign',
] as const

const AMBIGUITY_WORDS = [
  'best',
  'optimal',
  'better',
  'improve',
  'enhance',
  'optimise',
  'optimize',
] as const

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
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

/**
 * Decides complexity from cheap rules and, when borderline, a small model call.
 */
export default class ComplexityDetector {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Default `gpt-4o-mini` for low latency and cost.
   */
  constructor(model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Scores a task and returns routing hints including optional ToT hyperparameters.
   */
  async assess(
    taskDescription: string,
    taskType: string,
    scratchpad?: CoTScratchpad | null,
  ): Promise<ComplexityAssessment> {
    let ruleScore = 0
    const signals: string[] = []

    if (taskDescription.length > 300) {
      ruleScore += 0.15
      signals.push('Long task description')
    }

    const lower = taskDescription.toLowerCase()
    const connectorCount = CONNECTORS.filter((c) => lower.includes(c)).length
    if (connectorCount >= 2) {
      ruleScore += 0.2
      signals.push(`${String(connectorCount)} requirement connectors`)
    }

    if (ARCHITECTURAL_KEYWORDS.some((k) => lower.includes(k))) {
      ruleScore += 0.25
      signals.push('Architectural complexity signal')
    }

    if (AMBIGUITY_WORDS.some((w) => lower.includes(w))) {
      ruleScore += 0.15
      signals.push('Ambiguous optimisation goal')
    }

    if (taskType === 'browser_task') {
      ruleScore += 0.1
      signals.push('Browser tasks are inherently multi-step')
    }

    if (scratchpad !== undefined && scratchpad !== null) {
      if (scratchpad.deadEnds.length > 0) {
        ruleScore += 0.2
        signals.push(`${String(scratchpad.deadEnds.length)} prior dead ends`)
      }
      if (scratchpad.subGoals.length > 3) {
        ruleScore += 0.1
        signals.push(`${String(scratchpad.subGoals.length)} sub-goals detected`)
      }
    }

    if (taskType === 'conversational') {
      return this._buildAssessment('trivial', 0, [], 'Conversational tasks never need ToT')
    }
    if (taskType === 'clarification_needed') {
      return this._buildAssessment('trivial', 0, [], 'Clarification tasks never need ToT')
    }

    ruleScore = clamp01(ruleScore)

    if (ruleScore <= 0.3) {
      return this._buildAssessment('simple', ruleScore, signals, 'Rule-based: low complexity')
    }

    if (ruleScore >= 0.75) {
      return this._buildAssessment('very_complex', ruleScore, signals, 'Rule-based: high complexity')
    }

    const llmScore = await this._assessWithLLM(taskDescription, taskType, signals)
    const compositeScore = clamp01(ruleScore * 0.6 + llmScore.score * 0.4)

    return this._buildAssessment(
      this._scoreToLevel(compositeScore),
      compositeScore,
      [...signals, ...llmScore.additionalSignals],
      llmScore.reasoning,
    )
  }

  private async _assessWithLLM(
    taskDescription: string,
    taskType: string,
    priorSignals: string[],
  ): Promise<{ score: number; reasoning: string; additionalSignals: string[] }> {
    const system =
      'Rate task complexity 0.0-1.0 where 1.0 means multiple competing valid approaches exist and wrong choice is costly. Return JSON: {score: 0-1, reasoning: string, additionalSignals: string[]}'

    const user = `Task: ${taskDescription}\nType: ${taskType}\nDetected signals: ${priorSignals.join(', ')}`

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

      if (parsed === null || typeof parsed !== 'object') {
        throw new Error('Invalid LLM response shape')
      }

      const o = parsed as Record<string, unknown>
      let score = 0.5
      if (typeof o.score === 'number' && Number.isFinite(o.score)) {
        score = clamp01(o.score)
      }

      const reasoning =
        typeof o.reasoning === 'string' && o.reasoning.trim().length > 0
          ? o.reasoning.trim()
          : 'LLM returned no reasoning.'

      const additionalSignals: string[] = []
      if (Array.isArray(o.additionalSignals)) {
        for (const x of o.additionalSignals) {
          if (typeof x === 'string' && x.trim().length > 0) {
            additionalSignals.push(x.trim())
          }
        }
      }

      return { score, reasoning, additionalSignals }
    } catch (err: unknown) {
      console.warn('[ComplexityDetector] LLM assess failed, using neutral score', err)
      return {
        score: 0.5,
        reasoning: 'LLM assessment failed; blended with rule score at 0.5.',
        additionalSignals: [],
      }
    }
  }

  private _scoreToLevel(score: number): ComplexityLevel {
    const s = clamp01(score)
    if (s < 0.2) return 'trivial'
    if (s < 0.4) return 'simple'
    if (s < 0.65) return 'moderate'
    if (s < 0.85) return 'complex'
    return 'very_complex'
  }

  private _buildAssessment(
    level: ComplexityLevel,
    score: number,
    signals: string[],
    reasoning: string,
  ): ComplexityAssessment {
    const s = clamp01(score)
    const useTot = s >= COMPLEXITY_TOT_THRESHOLD

    let totConfig: ComplexityAssessment['totConfig']
    if (level === 'complex') {
      totConfig = { beamWidth: 3, branchFactor: 4, maxDepth: 2 }
    } else if (level === 'very_complex') {
      totConfig = { beamWidth: 4, branchFactor: 5, maxDepth: 3 }
    } else {
      totConfig = { beamWidth: 2, branchFactor: 3, maxDepth: 1 }
    }

    return {
      level,
      score: s,
      useTot,
      totConfig,
      reasoning,
      signals: [...signals],
    }
  }
}
