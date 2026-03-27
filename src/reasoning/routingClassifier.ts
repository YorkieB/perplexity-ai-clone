/**
 * Maps task signals to a {@link ModelTier} using free rules first, then a tiny LLM gate for premium.
 *
 * @module reasoning/routingClassifier
 */

import OpenAI from 'openai'

import type { ComplexityAssessment } from './complexityDetector'
import type { CoTScratchpad } from './cotScratchpad'
import type { ModelSpec, ModelTier } from './modelRegistry'
import { MODEL_REGISTRY, ROUTING_RULES, estimateCost, getModelSpec } from './modelRegistry'

const LOG = '[RoutingClassifier]'

const PREMIUM_CONFIRM_TIMEOUT_MS = 3000

/** Inputs collected upstream (complexity, session usage, media, etc.). */
export interface RoutingSignals {
  taskType: string
  taskDescription: string
  /** Typically aligned with {@link ComplexityAssessment.score}. */
  complexityScore: number
  hasVisionContent: boolean
  estimatedOutputLength: 'short' | 'medium' | 'long' | 'very_long'
  requiresStructuredOutput: boolean
  iterationNumber: number
  priorFailures: number
  sessionPremiumCallCount: number
  sessionReasoningCallCount: number
  scratchpad?: CoTScratchpad | null
}

/** Resolved tier, model id, cost estimate, and audit trail. */
export interface RoutingDecision {
  tier: ModelTier
  /** Same shape as {@link ModelSpec.id} for the chosen tier. */
  model: string
  reasoningEffort?: 'low' | 'medium' | 'high'
  rationale: string
  estimatedCostUSD: number
  signals: string[]
  wasOverridden: boolean
  overrideReason?: string
}

function outputTokensForLength(length: RoutingSignals['estimatedOutputLength']): number {
  switch (length) {
    case 'short':
      return 200
    case 'medium':
      return 500
    case 'long':
      return 1000
    case 'very_long':
      return 2000
    default:
      return 500
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/**
 * Picks an OpenAI model tier for a task without blocking the pipeline on failures.
 */
export default class RoutingClassifier {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Fast model for borderline premium confirmation (default `gpt-4o-mini`).
   */
  constructor(model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Applies hard routes, adjusts complexity heuristically, then optionally confirms premium via LLM.
   */
  async classify(signals: RoutingSignals): Promise<RoutingDecision> {
    try {
      return await this.classifyInner(signals)
    } catch (err: unknown) {
      console.warn(`${LOG} Classification failed, defaulting to standard`, err)
      return this._buildDecision(
        'standard',
        'Classifier error — safe default',
        signals,
        true,
        'classification threw',
        ['error_fallback'],
      )
    }
  }

  private async classifyInner(signals: RoutingSignals): Promise<RoutingDecision> {
    /**
     * NOTE: ALWAYS_NANO routes (conversational, clarification_needed) return
     * immediately from the RULE-BASED section of classify() — before the
     * complexity score bands and before _confirmPremiumNeeded().
     * They DO enter classify() itself, but exit before any LLM call.
     * "Never reach LLM classification" means they never reach the
     * _confirmPremiumNeeded LLM gate — not that they bypass classify().
     */
    if (ROUTING_RULES.ALWAYS_NANO.includes(signals.taskType)) {
      return this._buildDecision(
        'nano',
        'Hard rule: always nano for this route',
        signals,
        true,
        `taskType ${signals.taskType} always uses nano`,
        ['ALWAYS_NANO'],
      )
    }

    if (ROUTING_RULES.ALWAYS_STANDARD.includes(signals.taskType)) {
      return this._buildDecision(
        'standard',
        'Hard rule: always standard for this route',
        signals,
        true,
        `taskType ${signals.taskType} always uses standard`,
        ['ALWAYS_STANDARD'],
      )
    }

    if (signals.hasVisionContent && signals.taskType !== 'image_task') {
      return this._buildDecision(
        'standard',
        'Vision content detected — gpt-4o required',
        signals,
        true,
        'Vision requires standard or premium tier',
        ['VISION_CONTENT'],
      )
    }

    const premiumCappedByCount =
      signals.sessionPremiumCallCount >= ROUTING_RULES.MAX_PREMIUM_CALLS_PER_SESSION
    const neverPremiumRoute = ROUTING_RULES.NEVER_PREMIUM.includes(signals.taskType)
    const preventPremium = premiumCappedByCount || neverPremiumRoute

    const ruleSignals: string[] = []
    let complexityScore = clamp01(signals.complexityScore)

    if (signals.priorFailures >= 2) {
      complexityScore = Math.min(complexityScore + 0.2, 1)
      ruleSignals.push(`${String(signals.priorFailures)} prior failures → escalate`)
    }

    if (signals.iterationNumber >= 2) {
      complexityScore = Math.min(complexityScore + 0.15, 1)
      ruleSignals.push(`Reflexion iteration ${String(signals.iterationNumber)} → escalate`)
    }

    if (signals.estimatedOutputLength === 'very_long') {
      complexityScore = Math.min(complexityScore + 0.1, 1)
      ruleSignals.push('Very long output required → escalate')
    }

    if (premiumCappedByCount) {
      ruleSignals.push(
        `Premium session cap (${String(ROUTING_RULES.MAX_PREMIUM_CALLS_PER_SESSION)})`,
      )
    }
    if (neverPremiumRoute) {
      ruleSignals.push('NEVER_PREMIUM route')
    }

    if (signals.requiresStructuredOutput) {
      ruleSignals.push('Structured output requested')
    }

    if (complexityScore <= ROUTING_RULES.NANO_MAX_COMPLEXITY) {
      return this._buildDecision('nano', 'Low complexity', signals, false, undefined, ruleSignals)
    }

    if (complexityScore <= ROUTING_RULES.STANDARD_MAX_COMPLEXITY) {
      return this._buildDecision('standard', 'Moderate complexity', signals, false, undefined, ruleSignals)
    }

    if (complexityScore <= ROUTING_RULES.REASONING_MAX_COMPLEXITY) {
      return this._reasoningOrStandardDowngrade(
        'High complexity',
        signals,
        false,
        undefined,
        ruleSignals,
      )
    }

    let premiumJustified = false
    try {
      premiumJustified = await this._confirmPremiumNeeded(signals)
    } catch (err: unknown) {
      console.warn(`${LOG} Premium confirmation failed, defaulting to reasoning tier`, err)
      premiumJustified = false
    }

    if (premiumJustified && !preventPremium) {
      return this._buildDecision(
        'premium',
        'Very high complexity — premium justified',
        signals,
        false,
        undefined,
        ruleSignals,
      )
    }

    if (premiumJustified && preventPremium) {
      return this._reasoningOrStandardDowngrade(
        'Very high complexity — premium disallowed by guardrail',
        signals,
        true,
        premiumCappedByCount
          ? `Premium cap (${String(ROUTING_RULES.MAX_PREMIUM_CALLS_PER_SESSION)} calls)`
          : 'Route may not use premium',
        ruleSignals,
      )
    }

    return this._reasoningOrStandardDowngrade(
      'High complexity but premium not confirmed',
      signals,
      false,
      undefined,
      ruleSignals,
    )
  }

  /** When reasoning tier is chosen but session reasoning calls are exhausted, use standard. */
  private _reasoningOrStandardDowngrade(
    rationale: string,
    signals: RoutingSignals,
    wasOverridden: boolean,
    overrideReason: string | undefined,
    ruleSignals: string[],
  ): RoutingDecision {
    if (signals.sessionReasoningCallCount >= ROUTING_RULES.MAX_REASONING_CALLS_PER_SESSION) {
      return this._buildDecision(
        'standard',
        `${rationale} (reasoning tier capped)`,
        signals,
        true,
        overrideReason ?? `reasoning calls >= ${String(ROUTING_RULES.MAX_REASONING_CALLS_PER_SESSION)}`,
        [...ruleSignals, 'REASONING_SESSION_CAP'],
      )
    }
    return this._buildDecision('reasoning', rationale, signals, wasOverridden, overrideReason, ruleSignals)
  }

  private async _confirmPremiumNeeded(signals: RoutingSignals): Promise<boolean> {
    const user = `Answer YES or NO only.
Is this task complex enough to require o3 (the most powerful reasoning model available)? o3 should only be used for tasks where GPT-4o would likely fail due to reasoning complexity.

Task: ${signals.taskDescription.slice(0, 300)}
Complexity score: ${String(signals.complexityScore)}
Prior failures: ${String(signals.priorFailures)}
Task type: ${signals.taskType}`

    const completionPromise = this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 8,
      messages: [{ role: 'user', content: user }],
    })

    const result = await Promise.race([
      completionPromise.then((r) => ({ kind: 'ok' as const, r })),
      new Promise<{ kind: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'timeout' }), PREMIUM_CONFIRM_TIMEOUT_MS),
      ),
    ])

    if (result.kind === 'timeout') {
      console.warn(`${LOG} Premium confirmation timed out`)
      return false
    }

    const text = result.r.choices[0]?.message?.content?.trim() ?? ''
    return text.toUpperCase().startsWith('YES')
  }

  private _buildDecision(
    tier: ModelTier,
    rationale: string,
    signals: RoutingSignals,
    wasOverridden: boolean,
    overrideReason?: string,
    extraSignals: string[] = [],
  ): RoutingDecision {
    void MODEL_REGISTRY[tier]
    const spec = getModelSpec(tier)
    const inputTokens = Math.max(1, Math.floor(signals.taskDescription.length / 4))
    const outputTokens = outputTokensForLength(signals.estimatedOutputLength)

    let reasoningEffort: 'low' | 'medium' | 'high' | undefined
    if (tier === 'premium') {
      reasoningEffort = 'high'
    } else if (tier === 'reasoning') {
      reasoningEffort = signals.iterationNumber >= 2 ? 'high' : 'medium'
    }

    const estimatedCostUSD = estimateCost(tier, inputTokens, outputTokens)
    const outSignals = [...extraSignals]

    return {
      tier,
      model: spec.id,
      reasoningEffort,
      rationale,
      estimatedCostUSD,
      signals: outSignals,
      wasOverridden,
      overrideReason,
    }
  }
}
