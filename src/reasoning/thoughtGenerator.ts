/**
 * Structured {@link Thought} generation for the Jarvis ReAct engine: situation
 * analysis, explicit assumptions/risks, and confidence before any action.
 *
 * @module reasoning/thoughtGenerator
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

import { modelRouter } from '@/reasoning/modelRouter'

import { buildScratchpadSummary } from './cotScratchpad'
import { scratchpadStore } from './scratchpadStore'
import type { ModelTier } from './modelRegistry'
import type { Thought, ThoughtType, ReActStep } from './reactTypes'
import {
  MAX_REACT_STEPS,
  THOUGHT_CONFIDENCE_THRESHOLD,
} from './reactTypes'

const LOG = '[ThoughtGenerator]'

/**
 * Inputs needed to produce the next {@link Thought} in a ReAct trace.
 */
export interface ThoughtContext {
  /** Latest user message driving the task. */
  userMessage: string
  /** Intent route / task channel (e.g. semantic router output). */
  taskType: string
  /** All completed Thought → Action → Observation cycles in this trace. */
  priorSteps: ReActStep[]
  /** Retrieved RAG / context chunks. */
  ragContent: string[]
  /** Optional Manager brief when available. */
  taskBrief?: string
  /** Most recent observation summary (e.g. last step’s observation content). */
  lastObservation?: string
  /** How many times the Worker has run in this task (for loop / uncertainty signals). */
  iterationCount: number
  /** Risks accumulated across prior ReAct steps (optional; used by loop orchestration). */
  accumulatedRisks?: string[]
  /** CoT scratchpad id; lookup tries session index first, then direct id (see `scratchpadStore`). */
  scratchpadId?: string
  /** When set with {@link complexityScore}, {@link ReActEngine} may pre-route and set {@link routedModel}. */
  sessionId?: string
  /** Complexity for {@link modelRouter}; required together with {@link sessionId} for routed thoughts. */
  complexityScore?: number
  /** When {@link ReActEngine} pre-routes, skips a second {@link modelRouter.route} in {@link generate}. */
  routedModel?: string
  routedTier?: ModelTier
}

/** Parsed JSON shape from the model before building a {@link Thought}. */
interface ThoughtJsonPayload {
  type?: string
  content?: string
  confidence?: number
  assumptions?: unknown
  risks?: unknown
  alternativesConsidered?: unknown
}

/** Parsed JSON for {@link ThoughtGenerator.generateUncertaintyCheck}. */
interface UncertaintyJsonPayload {
  shouldProceed?: boolean
  reason?: string
  confidence?: number
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/**
 * Strips leading/trailing ``` / ```json fences (line-based, no backtracking regex).
 */
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

/**
 * Strips optional fences and parses JSON.
 */
function parseJsonObject(raw: string): unknown {
  const s = stripMarkdownFence(raw)
  return JSON.parse(s) as unknown
}

/**
 * Produces structured thoughts via OpenAI before ReAct actions run.
 */
export default class ThoughtGenerator {
  private readonly client: OpenAI
  private readonly model: string

  /**
   * @param model - Chat completion model id (default `gpt-4o`).
   */
  constructor(model: string = 'gpt-4o') {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
    })
    this.model = model
  }

  /** Resolves chat model: pre-routed, {@link modelRouter}, or constructor default. */
  private async resolveChatModel(context: ThoughtContext): Promise<string> {
    if (context.routedModel !== undefined && context.routedModel.length > 0) {
      return context.routedModel
    }
    if (
      context.sessionId !== undefined &&
      context.sessionId.length > 0 &&
      context.complexityScore !== undefined
    ) {
      const routerResult = await modelRouter.route({
        sessionId: context.sessionId,
        taskType: context.taskType,
        taskDescription: context.userMessage,
        complexityScore: context.complexityScore,
        iterationNumber: context.iterationCount,
        estimatedOutputLength: 'short',
      })
      return routerResult.model
    }
    // NOTE: If complexityScore is not provided, ThoughtGenerator uses
    // this.model (constructor default). Callers that want routing must
    // set BOTH sessionId and complexityScore on ThoughtContext.
    // ReActEngine always sets both — other callers default to gpt-4o.
    return this.model
  }

  /**
   * Generates a single Thought for the current context.
   * NOTE: Low-confidence deepening (re-thinking when confidence < threshold)
   * is intentionally handled by ReActEngine.think(), not here.
   * ThoughtGenerator is stateless — it generates one Thought per call.
   * ReActEngine owns the "is this Thought good enough?" decision.
   *
   * @param context - Current task and trace state.
   * @param forceType - When set, skips automatic type selection.
   * @returns A complete {@link Thought} with id, timestamp, and turn index.
   */
  async generate(
    context: ThoughtContext,
    forceType?: ThoughtType,
  ): Promise<Thought> {
    const thoughtType = forceType ?? this._selectThoughtType(context)
    const turnIndex = context.priorSteps.length

    try {
      const systemPrompt = this._buildSystemPrompt(context, thoughtType)
      const userPrompt = this._buildUserPrompt(context, thoughtType)
      const modelToUse = await this.resolveChatModel(context)

      const completion = await this.client.chat.completions.create({
        model: modelToUse,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) {
        console.warn(`${LOG} Empty model response, generating fallback thought`)
        return this._fallbackThought(context, thoughtType, turnIndex)
      }

      let parsed: unknown
      try {
        parsed = parseJsonObject(text)
      } catch {
        console.warn(`${LOG} Parse failed, generating fallback thought`)
        return this._fallbackThought(context, thoughtType, turnIndex)
      }

      const obj = parsed as ThoughtJsonPayload
      const content =
        typeof obj.content === 'string' && obj.content.length > 0
          ? obj.content
          : context.userMessage

      return {
        id: uuidv4(),
        type: thoughtType,
        content,
        taskType: context.taskType,
        confidence: clamp01(
          typeof obj.confidence === 'number' ? obj.confidence : 0.5,
        ),
        assumptions: asStringArray(obj.assumptions),
        risks: asStringArray(obj.risks),
        alternativesConsidered: asStringArray(obj.alternativesConsidered),
        timestamp: new Date().toISOString(),
        turnIndex,
      }
    } catch (err) {
      console.warn(`${LOG} Thought generation failed, generating fallback thought`, err)
      return this._fallbackThought(context, thoughtType, turnIndex)
    }
  }

  /**
   * Lightweight gate before irreversible or high-stakes actions.
   *
   * @param context - Same trace/task context as {@link generate}.
   * @param proposedAction - Human-readable description of the planned action.
   */
  async generateUncertaintyCheck(
    context: ThoughtContext,
    proposedAction: string,
  ): Promise<{ shouldProceed: boolean; reason: string; confidence: number }> {
    const system = `You are a safety reviewer for Jarvis. Answer whether it is reasonable to proceed with a proposed action given the context.
Return ONLY valid JSON:
{"shouldProceed": boolean, "reason": "short explanation", "confidence": 0.0-1.0}
Use confidence to reflect real uncertainty. Be conservative when information is missing.`

    const obsBlock = context.lastObservation
      ? `Last observation:\n${context.lastObservation.slice(0, 800)}`
      : ''
    const user = `Task type: ${context.taskType}
User message: ${context.userMessage}
Proposed action: ${proposedAction}
Prior steps: ${context.priorSteps.length}
Iteration count: ${context.iterationCount}
${obsBlock}`

    try {
      const modelToUse = await this.resolveChatModel(context)
      const completion = await this.client.chat.completions.create({
        model: modelToUse,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      if (!text) {
        return {
          shouldProceed: false,
          reason: 'Empty uncertainty check response',
          confidence: 0,
        }
      }

      const parsed = parseJsonObject(text) as UncertaintyJsonPayload
      const confidence = clamp01(
        typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      )
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.length > 0
          ? parsed.reason
          : 'No reason provided'

      let shouldProceed = parsed.shouldProceed === true
      if (parsed.shouldProceed === undefined) {
        shouldProceed = confidence >= THOUGHT_CONFIDENCE_THRESHOLD
      }

      return { shouldProceed, reason, confidence }
    } catch {
      return {
        shouldProceed: false,
        reason: 'Uncertainty check failed',
        confidence: 0,
      }
    }
  }

  private _fallbackThought(
    context: ThoughtContext,
    _selectedType: ThoughtType,
    turnIndex: number,
  ): Thought {
    return {
      id: uuidv4(),
      type: 'problem_analysis',
      content: context.userMessage,
      taskType: context.taskType,
      confidence: 0.5,
      assumptions: [],
      risks: ['Thought generation failed'],
      alternativesConsidered: [],
      timestamp: new Date().toISOString(),
      turnIndex,
    }
  }

  private _buildSystemPrompt(
    context: ThoughtContext,
    thoughtType: ThoughtType,
  ): string {
    const obsLine = context.lastObservation
      ? `Last observation: ${context.lastObservation}`
      : ''

    return `You are Jarvis's reasoning engine. Your job is to produce a single, structured Thought before any action is taken.

A good Thought:
- Analyses the ACTUAL problem, not just the surface request
- Makes assumptions EXPLICIT (not hidden)
- Identifies what could go WRONG before acting
- Considers at least one ALTERNATIVE approach and explains why the chosen approach is better
- Assigns a confidence score (0.0–1.0) reflecting genuine uncertainty

Current task type: ${context.taskType}
Prior steps completed: ${context.priorSteps.length}
${obsLine}

Return ONLY valid JSON matching this exact schema:
{
  "type": "${thoughtType}",
  "content": "the full reasoning text (2–5 sentences)",
  "confidence": 0.0-1.0,
  "assumptions": ["assumption 1", "assumption 2"],
  "risks": ["risk 1", "risk 2"],
  "alternativesConsidered": ["alternative A: rejected because...", "..."]
}`
  }

  private _buildUserPrompt(
    context: ThoughtContext,
    thoughtType: ThoughtType,
  ): string {
    const parts: string[] = [`Task: ${context.userMessage}`]

    if (context.ragContent.length > 0) {
      const ctx = context.ragContent.slice(0, 3).join('\n---\n')
      parts.push(`Available context:\n${ctx}`)
    }

    if (context.priorSteps.length > 0) {
      parts.push(`Prior reasoning:\n${this._summarisePriorSteps(context.priorSteps)}`)
    }

    if (context.scratchpadId) {
      const pad =
        scratchpadStore.getForSession(context.scratchpadId) ??
        scratchpadStore.get(context.scratchpadId)
      if (pad) {
        parts.push(
          `<current_understanding>\n${buildScratchpadSummary(pad)}\n</current_understanding>`,
        )
      }
    }

    if (context.taskBrief) {
      parts.push(`Task brief:\n${context.taskBrief.slice(0, 500)}`)
    }

    parts.push(`Generate a ${thoughtType} thought.`)

    return parts.join('\n\n')
  }

  /**
   * Chooses the next {@link ThoughtType} from trace heuristics.
   */
  private _selectThoughtType(context: ThoughtContext): ThoughtType {
    if (context.priorSteps.length === 0) {
      return 'problem_analysis'
    }

    const last = context.priorSteps[context.priorSteps.length - 1]
    const { status, meetsExpectation } = last.observation

    if (status === 'failure') {
      return 'error_diagnosis'
    }
    if (status === 'partial') {
      return 'refinement_reasoning'
    }
    if (meetsExpectation === false) {
      return 'observation_analysis'
    }
    if (context.iterationCount > 1) {
      return 'uncertainty_check'
    }
    if (context.priorSteps.length >= MAX_REACT_STEPS - 1) {
      return 'completion_check'
    }
    return 'plan_formation'
  }

  /**
   * Compact summary of the last three {@link ReActStep} rows for the prompt.
   */
  private _summarisePriorSteps(steps: ReActStep[]): string {
    const lastThree = steps.slice(-3)
    return lastThree
      .map((s) => {
        const n = s.stepIndex
        const tt = s.thought.type
        const at = s.action.type
        const os = s.observation.status
        return `Step ${n}: [${tt}] → [${at}] → [${os}]`
      })
      .join('\n')
  }
}
