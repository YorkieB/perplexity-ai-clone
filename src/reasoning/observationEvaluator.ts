/**
 * Builds structured {@link Observation} records by comparing action outcomes
 * to what the preceding {@link Thought} predicted.
 *
 * @module reasoning/observationEvaluator
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

import type { Observation, ObservationStatus, Thought, Action } from './reactTypes'

const LOG = '[ObservationEvaluator]'

const OBSERVATION_STATUSES: readonly ObservationStatus[] = [
  'success',
  'partial',
  'failure',
  'unexpected',
  'needs_refinement',
] as const

/**
 * Raw result of executing an {@link Action} in the environment.
 */
export interface ActionOutcome {
  /** {@link Action.type} string for logging / routing. */
  actionType: string
  /** Verbatim or stringified output from the executor. */
  rawOutput: string
  /** Whether the action finished without throwing / protocol error. */
  success: boolean
  /** Optional token usage from the underlying model call. */
  tokensUsed?: number
  /** Wall-clock time for the action. */
  durationMs?: number
  /** Error message when {@link success} is false. */
  error?: string
}

interface EvalJsonPayload {
  status?: string
  meetsExpectation?: boolean
  surprises?: unknown
  nextThoughtHint?: string
  summary?: string
}

interface CompletionJsonPayload {
  isComplete?: boolean
  completionScore?: number
  missingElements?: unknown
}

function stripMarkdownFence(raw: string): string {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return raw.trim()
  const first = lines[0]?.trim() ?? ''
  const last = lines[lines.length - 1]?.trim() ?? ''
  if (first.startsWith('```') && last === '```') {
    return lines.slice(1, -1).join('\n').trim()
  }
  return raw.trim()
}

function parseJsonObject(raw: string): unknown {
  const s = stripMarkdownFence(raw)
  return JSON.parse(s) as unknown
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function normalizeObservationStatus(raw: string | undefined): ObservationStatus {
  if (raw && (OBSERVATION_STATUSES as readonly string[]).includes(raw)) {
    return raw as ObservationStatus
  }
  return 'success'
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

/**
 * Uses a small, fast model to classify outcomes vs prior thoughts and to score final answers.
 */
export default class ObservationEvaluator {
  private readonly client: OpenAI
  private readonly model: string

  /**
   * @param model - Chat model for evaluation (default `gpt-4o-mini`).
   */
  constructor(model: string = 'gpt-4o-mini') {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
    })
    this.model = model
  }

  /**
   * Produces an {@link Observation} for a single Thought → Action → outcome triple.
   */
  async evaluate(
    thought: Thought,
    action: Action,
    outcome: ActionOutcome,
  ): Promise<Observation> {
    if (!outcome.success) {
      return this._buildFailureObservation(thought, action, outcome)
    }

    if (action.type === 'complete') {
      return this._buildSuccessObservation(thought, action, outcome)
    }

    const system = `You are evaluating whether an action's output matches what was predicted in the preceding Thought.

Return ONLY valid JSON:
{
  "status": "success|partial|failure|unexpected|needs_refinement",
  "meetsExpectation": true|false,
  "surprises": ["unexpected thing 1", "..."],
  "nextThoughtHint": "suggestion for what to reason about next (optional)",
  "summary": "1-2 sentence summary of what was observed"
}`

    const outputSample = outcome.rawOutput.slice(0, 1500)
    const user = `Thought predicted: ${thought.content}
Thought confidence was: ${thought.confidence}
Action taken: ${action.description}
Action output: ${outputSample}`

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) {
        throw new Error('Empty evaluation response')
      }

      let parsed: unknown
      try {
        parsed = parseJsonObject(text)
      } catch {
        throw new Error('Invalid evaluation JSON')
      }

      const obj = parsed as EvalJsonPayload
      const status = normalizeObservationStatus(obj.status)
      const meetsExpectation = obj.meetsExpectation === true
      const surprises = asStringArray(obj.surprises)
      const summary =
        typeof obj.summary === 'string' && obj.summary.length > 0
          ? obj.summary
          : outcome.rawOutput.slice(0, 500)

      const observation: Observation = {
        id: uuidv4(),
        status,
        content: summary,
        triggeredByActionId: action.id,
        meetsExpectation,
        surprises,
        timestamp: new Date().toISOString(),
      }

      if (typeof obj.nextThoughtHint === 'string' && obj.nextThoughtHint.length > 0) {
        observation.nextThoughtHint = obj.nextThoughtHint
      }

      return observation
    } catch (err) {
      console.warn(`${LOG} Evaluation failed, defaulting to success observation`, err)
      return this._buildSuccessObservation(thought, action, outcome)
    }
  }

  /**
   * Final pass: does {@link finalOutput} satisfy {@link originalRequest}?
   */
  async evaluateCompletion(
    originalRequest: string,
    finalOutput: string,
    taskType: string,
  ): Promise<{
    isComplete: boolean
    completionScore: number
    missingElements: string[]
  }> {
    const system = `You judge whether an assistant output fully addresses the user's original request.

Return ONLY valid JSON:
{
  "isComplete": true|false,
  "completionScore": 0.0-1.0,
  "missingElements": ["what is still missing or weak", "..."]
}

Be strict on code, facts, and explicit user constraints; slightly lenient on tone.`

    const user = `Task type: ${taskType}
Original request:
${originalRequest.slice(0, 2000)}

Final output:
${finalOutput.slice(0, 3000)}`

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) {
        throw new Error('Empty completion evaluation')
      }

      const parsed = parseJsonObject(text) as CompletionJsonPayload
      const isComplete = parsed.isComplete === true
      const completionScore = clamp01(
        typeof parsed.completionScore === 'number' ? parsed.completionScore : 0.75,
      )
      const missingElements = asStringArray(parsed.missingElements)

      return { isComplete, completionScore, missingElements }
    } catch (err) {
      console.warn(`${LOG} Completion evaluation failed, using optimistic defaults`, err)
      return {
        isComplete: true,
        completionScore: 0.75,
        missingElements: [],
      }
    }
  }

  private _buildFailureObservation(
    _thought: Thought,
    action: Action,
    outcome: ActionOutcome,
  ): Observation {
    const errMsg = outcome.error ?? 'Action failed without error message'
    return {
      id: uuidv4(),
      status: 'failure',
      content: `Action ${action.type} failed: ${outcome.error ?? 'unknown error'}`,
      triggeredByActionId: action.id,
      meetsExpectation: false,
      surprises: [errMsg],
      nextThoughtHint: 'Diagnose the failure before retrying',
      timestamp: new Date().toISOString(),
    }
  }

  private _buildSuccessObservation(
    _thought: Thought,
    action: Action,
    outcome: ActionOutcome,
  ): Observation {
    return {
      id: uuidv4(),
      status: 'success',
      content: outcome.rawOutput.slice(0, 500),
      triggeredByActionId: action.id,
      meetsExpectation: true,
      surprises: [],
      timestamp: new Date().toISOString(),
    }
  }
}
