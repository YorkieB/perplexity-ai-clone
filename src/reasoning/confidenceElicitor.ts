/**
 * System 1 — Uncertainty-Aware Memory (UAM) for the Dual-Process AUQ pipeline
 * (arXiv:2601.15703): fast extraction or a single cheap elicitation call.
 * Does not block the main pipeline on failure (neutral fallbacks).
 *
 * @module reasoning/confidenceElicitor
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

import type { ConfidenceScore, ConfidenceVector, PreTaskEstimate } from './confidenceTypes'
import {
  CONFIDENCE_THRESHOLDS,
  scoreToAction,
  scoreToLevel,
} from './confidenceTypes'

const LOG = '[ConfidenceElicitor]'

/** Fixed model for {@link ConfidenceElicitor.estimatePreTask} (fast / low cost). */
const PRE_TASK_MODEL = 'gpt-4o-mini'

/** As specified for simple flat JSON objects (fallback when brace-balanced parse fails). */
const CONFIDENCE_FLAT_REGEX = /\{[^{}]{0,200}"confidence"\s*:\s*([\d.]+)[^{}]{0,200}\}/g

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/**
 * Extracts a `{ ... }` substring starting at `start` with balanced braces,
 * respecting strings and escapes.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- brace-balanced JSON slicer with string/escape tracking; all state must be co-located for correctness
function sliceBalancedJson(s: string, start: number): string | null {
  if (s[start] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]!
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Finds the last JSON object in `text` that contains `"key":` and parses it.
 */
function parseLastJsonObjectWithKey(
  text: string,
  key: 'confidence' | 'scalar',
): Record<string, unknown> | null {
  const needle = `"${key}"`
  let searchEnd = text.length
  for (;;) {
    const keyIdx = text.lastIndexOf(needle, searchEnd)
    if (keyIdx < 0) return null
    const open = text.lastIndexOf('{', keyIdx)
    if (open < 0) {
      searchEnd = keyIdx - 1
      continue
    }
    const slice = sliceBalancedJson(text, open)
    if (slice === null) {
      searchEnd = keyIdx - 1
      continue
    }
    try {
      const obj = JSON.parse(slice) as unknown
      if (obj !== null && typeof obj === 'object' && !Array.isArray(obj) && key in obj) {
        return obj as Record<string, unknown>
      }
    } catch {
      // try earlier
    }
    searchEnd = keyIdx - 1
  }
}

function parseVote(text: string): 'YES' | 'PARTIAL' | 'NO' {
  const u = text.trim().toUpperCase()
  if (u.startsWith('YES')) return 'YES'
  if (u.startsWith('PARTIAL')) return 'PARTIAL'
  if (u.startsWith('NO')) return 'NO'
  if (u.includes('PARTIAL')) return 'PARTIAL'
  if (u.includes('NO')) return 'NO'
  if (u.includes('YES')) return 'YES'
  return 'PARTIAL'
}

/**
 * System 1 UAM: extract verbalized confidence from prior output or elicit with one cheap call.
 */
export default class ConfidenceElicitor {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Fast chat model for elicitation / consistency (default `gpt-4o-mini`).
   */
  constructor(model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Attempts to read a confidence object appended to model output (zero LLM cost).
   * Prefers `"confidence"`; falls back to `"scalar"` for {@link ELICITATION_INSTRUCTION} payloads.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- parses confidence envelopes with scalar/boolean/string variants and multi-key fallback
  extractFromOutput(
    output: string,
    sessionId: string,
    taskType: string,
    turnIndex: number,
  ): ConfidenceScore | null {
    let obj =
      parseLastJsonObjectWithKey(output, 'confidence') ??
      parseLastJsonObjectWithKey(output, 'scalar')

    let scalar: number | undefined
    let explanation = ''
    let uncertaintyFactors: string[] = []
    let knowledgeGaps: string[] = []

    if (obj !== null) {
      let raw: number
      if (typeof obj.confidence === 'number') {
        raw = obj.confidence
      } else if (typeof obj.scalar === 'number') {
        raw = obj.scalar
      } else {
        raw = Number(obj.confidence ?? obj.scalar)
      }
      if (Number.isFinite(raw)) scalar = clamp01(raw)
      explanation = typeof obj.explanation === 'string' ? obj.explanation : ''
      uncertaintyFactors = asStringArray(obj.uncertaintyFactors)
      knowledgeGaps = asStringArray(obj.knowledgeGaps)
    }

    if (scalar === undefined) {
      const matches = [...output.matchAll(CONFIDENCE_FLAT_REGEX)]
      if (matches.length === 0) {
        console.log(`${LOG} No confidence JSON found in output`)
        return null
      }
      const m = matches[matches.length - 1]!
      try {
        obj = JSON.parse(m[0]!) as Record<string, unknown>
        const raw = typeof obj.confidence === 'number' ? obj.confidence : Number(m[1])
        if (Number.isFinite(raw)) scalar = clamp01(raw)
        explanation = typeof obj.explanation === 'string' ? obj.explanation : ''
        uncertaintyFactors = asStringArray(obj.uncertaintyFactors)
        knowledgeGaps = asStringArray(obj.knowledgeGaps)
      } catch {
        const raw = Number(m[1])
        if (Number.isFinite(raw)) scalar = clamp01(raw)
      }
    }

    if (scalar === undefined) {
      console.log(`${LOG} No confidence JSON found in output`)
      return null
    }

    const level = scoreToLevel(scalar)
    const recommendedAction = scoreToAction(scalar, 0.5, 0)

    console.log(`${LOG} Extracted verbalized confidence: ${String(scalar)}`)

    return {
      id: uuidv4(),
      sessionId,
      turnIndex,
      scalar,
      level,
      source: 'verbalized',
      explanation: explanation.length > 0 ? explanation : 'Parsed from appended confidence JSON',
      uncertaintyFactors,
      knowledgeGaps,
      recommendedAction,
      taskType,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * UAM path: reuse embedded JSON if present; otherwise one short completion for verbalized confidence.
   */
  async elicit(
    output: string,
    taskDescription: string,
    taskType: string,
    sessionId: string,
    turnIndex: number,
  ): Promise<ConfidenceScore> {
    const extracted = this.extractFromOutput(output, sessionId, taskType, turnIndex)
    if (extracted !== null) return extracted

    const userMessage = `Rate your confidence in this output (0.0–1.0).
Be calibrated: 1.0 = certain, 0.5 = genuinely unsure.

Task: ${taskDescription.slice(0, 200)}
Task type: ${taskType}
Output snippet: ${output.slice(0, 600)}

Return ONLY JSON:
{"confidence": 0.0-1.0, "explanation": "why", 
 "uncertaintyFactors": ["factor"], "knowledgeGaps": ["gap"]}`

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        stream: false,
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      const parsed = JSON.parse(text) as Record<string, unknown>
      const raw = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence)
      const scalar = clamp01(raw)
      const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : ''
      const uncertaintyFactors = asStringArray(parsed.uncertaintyFactors)
      const knowledgeGaps = asStringArray(parsed.knowledgeGaps)
      const level = scoreToLevel(scalar)
      const recommendedAction = scoreToAction(scalar, 0.5, 0)

      return {
        id: uuidv4(),
        sessionId,
        turnIndex,
        scalar,
        level,
        source: 'verbalized',
        explanation,
        uncertaintyFactors,
        knowledgeGaps,
        recommendedAction,
        taskType,
        timestamp: new Date().toISOString(),
      }
    } catch {
      console.warn(`${LOG} Elicitation failed, returning neutral`)
      const scalar = 0.7
      return {
        id: uuidv4(),
        sessionId,
        turnIndex,
        scalar,
        level: scoreToLevel(scalar),
        source: 'verbalized',
        explanation: 'Confidence elicitation failed — neutral default',
        uncertaintyFactors: [],
        knowledgeGaps: [],
        recommendedAction: 'proceed_with_flag',
        taskType,
        timestamp: new Date().toISOString(),
      }
    }
  }

  /**
   * Proactive pre-task confidence (CoCA / confidence-first): estimates likelihood of a high-quality
   * response **before** spending full task budget, using session context and past uncertainty signals.
   *
   * @param taskDescription - Natural-language task the worker is about to run.
   * @param taskType - Intent route (e.g. `code_instruction`).
   * @param sessionId - Session id for logs / downstream correlation.
   * @param context - Optional scratchpad summary, recent uncertainty factors, and lesson snippets.
   */
  async estimatePreTask(
    taskDescription: string,
    taskType: string,
    sessionId: string,
    context?: {
      scratchpadSummary?: string
      recentUncertaintyFactors?: string[]
      relevantLessons?: string[]
    },
  ): Promise<PreTaskEstimate> {
    const contextBlock = [
      context?.scratchpadSummary
        ? `Session context: ${context.scratchpadSummary}`
        : '',
      context?.recentUncertaintyFactors?.length
        ? `Recent uncertainty: ${context.recentUncertaintyFactors.join(', ')}`
        : '',
      context?.relevantLessons?.length
        ? `Relevant lessons: ${context.relevantLessons.slice(0, 3).join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    const system = `You are a pre-task confidence estimator.
Before any task is attempted, estimate the probability of producing a high-quality response.

Be calibrated and honest. Consider:
- How well-defined is the task?
- Are there missing details that would significantly change the approach?
- Does the session context reveal relevant uncertainties?
- Are there lessons from past failures that apply here?

Return ONLY valid JSON — no other text:
{
  "confidence": 0.0-1.0,
  "explanation": "why this confidence level",
  "missingInfo": ["info that would help"],
  "clarifyingQuestions": ["question if confidence < 0.70"],
  "suggestedApproach": "brief approach hint if confidence >= 0.70",
  "shouldProceed": true|false
}

shouldProceed = false only when missingInfo is so critical that proceeding would likely produce wrong output.`

    const user = `Task: ${taskDescription}
Task type: ${taskType}
${contextBlock.length > 0 ? `${contextBlock}\n` : ''}
Estimate confidence BEFORE attempting this task.`

    const elicitedAt = new Date().toISOString()

    const fallback = (): PreTaskEstimate => ({
      confidence: 0.65,
      explanation: 'Pre-task estimation failed — neutral default',
      missingInfo: [],
      clarifyingQuestions: [],
      suggestedApproach: '',
      shouldProceed: true,
      elicitedAt,
      taskType,
    })

    try {
      const completion = await this.openai.chat.completions.create({
        model: PRE_TASK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        stream: false,
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      const parsed = JSON.parse(text) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn(`${LOG} Pre-task estimate: invalid JSON shape (session ${sessionId})`)
        return fallback()
      }
      const o = parsed as Record<string, unknown>
      const raw =
        typeof o.confidence === 'number' ? o.confidence : Number(o.confidence)
      const confidence = clamp01(raw)
      const explanation = typeof o.explanation === 'string' ? o.explanation : ''
      const missingInfo = asStringArray(o.missingInfo)
      const clarifyingQuestions = asStringArray(o.clarifyingQuestions)
      const suggestedApproach =
        typeof o.suggestedApproach === 'string' ? o.suggestedApproach : ''
      const shouldProceed = o.shouldProceed !== false

      console.log(
        `${LOG} Pre-task estimate session=${sessionId} type=${taskType} conf=${String(confidence)} proceed=${String(shouldProceed)}`,
      )

      return {
        confidence,
        explanation,
        missingInfo,
        clarifyingQuestions,
        suggestedApproach,
        shouldProceed,
        elicitedAt,
        taskType,
      }
    } catch (err: unknown) {
      console.warn(`${LOG} Pre-task estimation failed (session ${sessionId})`, err)
      return fallback()
    }
  }

  /**
   * Fuses heterogeneous signals into a {@link ConfidenceVector} (overall is a fixed weighted sum).
   * `verbalized` is accepted for forward compatibility; Phase 6 does not yet fold it into the vector.
   */
  computeVector(scores: {
    critique?: number
    observation?: boolean
    verbalized?: number
    ragHits?: number
  }): ConfidenceVector {

    const factual = scores.ragHits !== undefined ? clamp01(scores.ragHits) : 0.7
    let reasoning = 0.7
    if (scores.observation === true) reasoning = 0.85
    else if (scores.observation === false) reasoning = 0.45
    const completeness = scores.critique !== undefined ? clamp01(scores.critique) : 0.7
    const safety = 1.0
    const overall =
      factual * 0.25 + reasoning * 0.3 + completeness * 0.3 + safety * 0.15

    return {
      overall: clamp01(overall),
      factual,
      reasoning,
      completeness,
      safety,
    }
  }

  /**
   * Runs `n` independent stochastic checks (temperature 0.8). Expensive — gate at call site.
   */
  async checkConsistency(
    taskDescription: string,
    output: string,
    taskType: string,
    n: number = CONFIDENCE_THRESHOLDS.CONSISTENCY_SAMPLES,
  ): Promise<{ consistent: boolean; agreementScore: number; variance: string }> {
    const prompt = `In one sentence, is this output correct and complete for the task?
Task: ${taskDescription.slice(0, 200)}
Output: ${output.slice(0, 500)}
Answer YES, PARTIAL, or NO with brief reason.`

    const votes: Array<'YES' | 'PARTIAL' | 'NO'> = []
    const count = Math.max(1, Math.floor(n))

    for (let i = 0; i < count; i++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 80,
          stream: false,
        })
        const text = completion.choices[0]?.message?.content ?? ''
        votes.push(parseVote(text))
      } catch {
        votes.push('PARTIAL')
      }
    }

    let yes = 0
    let partial = 0
    let no = 0
    for (const v of votes) {
      if (v === 'YES') yes++
      else if (v === 'NO') no++
      else partial++
    }
    const maxVote = Math.max(yes, partial, no)
    const agreementScore = maxVote / count
    const variance = `YES:${String(yes)} PARTIAL:${String(partial)} NO:${String(no)}`
    const consistent = agreementScore >= 0.67

    return { consistent, agreementScore, variance }
  }
}

export type { PreTaskEstimate } from './confidenceTypes'
