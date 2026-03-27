/**
 * Single entry point for model selection: classifies route, applies budget guardrails, records spend.
 *
 * @module reasoning/modelRouter
 */

import { telemetry } from '@/lib/observability/telemetryCollector'

import { costTracker, DEFAULT_BUDGET, type SessionCostSummary } from './costTracker'
import type { ModelTier } from './modelRegistry'
import { ROUTING_RULES, estimateCost, getModelSpec } from './modelRegistry'
import RoutingClassifier, {
  type RoutingDecision,
  type RoutingSignals,
} from './routingClassifier'
import { scratchpadStore } from './scratchpadStore'

const LOG = '[ModelRouter]'

/** Inputs needed to classify and optionally downgrade by spend. */
export interface ModelRouterConfig {
  sessionId: string
  taskType: string
  taskDescription: string
  /** From {@link ComplexityDetector} (0–1). */
  complexityScore: number
  /** Reflexion iteration (default 0). */
  iterationNumber?: number
  hasVisionContent?: boolean
  estimatedOutputLength?: RoutingSignals['estimatedOutputLength']
  requiresStructuredOutput?: boolean
}

/** Resolved model + audit fields for callers and telemetry. */
export interface RouterResult {
  model: string
  tier: ModelTier
  reasoningEffort?: string
  decision: RoutingDecision
  costEstimateUSD: number
  sessionCostToDateUSD: number
  isApproachingBudget: boolean
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

/**
 * Combines {@link RoutingClassifier}, {@link costTracker}, and scratchpad signals.
 */
export default class ModelRouter {
  private readonly classifier: RoutingClassifier

  constructor() {
    this.classifier = new RoutingClassifier()
  }

  private reestimateDecision(
    base: RoutingDecision,
    tier: ModelTier,
    config: ModelRouterConfig,
    rationale: string,
    wasOverridden: boolean,
    overrideReason: string,
    extraSignals: string[],
  ): RoutingDecision {
    const spec = getModelSpec(tier)
    const inputTokens = Math.max(1, Math.floor(config.taskDescription.length / 4))
    const outLen = config.estimatedOutputLength ?? 'medium'
    const outputTokens = outputTokensForLength(outLen)
    const estimatedCostUSD = estimateCost(tier, inputTokens, outputTokens)

    let reasoningEffort: RoutingDecision['reasoningEffort']
    if (tier === 'premium') {
      reasoningEffort = 'high'
    } else if (tier === 'reasoning') {
      reasoningEffort = (config.iterationNumber ?? 0) >= 2 ? 'high' : 'medium'
    } else {
      reasoningEffort = undefined
    }

    return {
      ...base,
      tier,
      model: spec.id,
      rationale,
      estimatedCostUSD,
      reasoningEffort,
      signals: [...base.signals, ...extraSignals],
      wasOverridden,
      overrideReason,
    }
  }

  /**
   * Produces a tier/model for the next LLM call and records routing telemetry.
   */
  async route(config: ModelRouterConfig): Promise<RouterResult> {
    void ROUTING_RULES

    const pad = scratchpadStore.getForSession(config.sessionId)

    const signals: RoutingSignals = {
      taskType: config.taskType,
      taskDescription: config.taskDescription,
      complexityScore: config.complexityScore,
      hasVisionContent: config.hasVisionContent ?? false,
      estimatedOutputLength: config.estimatedOutputLength ?? 'medium',
      requiresStructuredOutput: config.requiresStructuredOutput ?? false,
      iterationNumber: config.iterationNumber ?? 0,
      priorFailures: pad?.deadEnds.length ?? 0,
      sessionPremiumCallCount: costTracker.getPremiumCallCount(config.sessionId),
      sessionReasoningCallCount: costTracker.getReasoningCallCount(config.sessionId),
      scratchpad: pad,
    }

    const decision = await this.classifier.classify(signals)
    let finalDecision: RoutingDecision = decision

    /**
     * NOTE: There are two independent premium caps — both must pass
     * for o3 to be used:
     *
     * Cap 1 (RoutingClassifier): MAX_PREMIUM_CALLS_PER_SESSION (default 3)
     *   — counts number of o3 API calls in the session
     *   — hard override: RoutingClassifier.classify() returns reasoning tier
     *     before even checking complexity if call count is reached
     *
     * Cap 2 (ModelRouter): MAX_PREMIUM_COST_USD (default $1.00)
     *   — tracks actual dollar spend on o3 calls via CostTracker
     *   — hard override: ModelRouter.route() downgrades premium → reasoning
     *     if dollar spend cap is reached
     *
     * These are different knobs. Cap 1 limits frequency. Cap 2 limits spend.
     * Either cap alone can block premium usage. Both can trigger independently.
     */
    if (decision.tier === 'premium' && costTracker.isPremiumCapReached(config.sessionId)) {
      finalDecision = this.reestimateDecision(
        decision,
        'reasoning',
        config,
        'Budget guardrail: o3 cap reached',
        true,
        'Premium budget cap reached — using reasoning tier',
        ['PREMIUM_BUDGET_CAP'],
      )
      console.warn(`${LOG} ⚠ Premium downgraded — cap reached (session: ${config.sessionId})`)
    }

    if (costTracker.isOverBudget(config.sessionId)) {
      if (finalDecision.tier !== 'nano') {
        finalDecision = this.reestimateDecision(
          finalDecision,
          'standard',
          config,
          `${finalDecision.rationale} (session budget guardrail)`,
          true,
          'Session budget limit reached',
          ['SESSION_BUDGET_CAP'],
        )
        console.warn(`${LOG} ⚠ Downgraded to standard — over budget (session: ${config.sessionId})`)
      }
    }

    telemetry.record('model_routed', config.sessionId, {
      tier: finalDecision.tier,
      model: finalDecision.model,
      taskType: config.taskType,
      complexityScore: config.complexityScore,
      wasOverridden: finalDecision.wasOverridden,
      estimatedCostUSD: finalDecision.estimatedCostUSD,
    })

    console.log(
      `${LOG} Routed to ${finalDecision.tier} (${finalDecision.model}) complexity: ${config.complexityScore.toFixed(2)} cost estimate: $${finalDecision.estimatedCostUSD.toFixed(5)}`,
    )

    const sessionSummary = costTracker.getSessionSummary(config.sessionId)
    return {
      model: finalDecision.model,
      tier: finalDecision.tier,
      reasoningEffort: finalDecision.reasoningEffort,
      decision: finalDecision,
      costEstimateUSD: finalDecision.estimatedCostUSD,
      sessionCostToDateUSD: sessionSummary.totalCostUSD,
      isApproachingBudget: sessionSummary.totalCostUSD >= DEFAULT_BUDGET.WARN_THRESHOLD_USD * 0.8,
    }
  }

  /**
   * Persists actual token usage after an API call (updates budgets / caps).
   */
  recordActualUsage(
    sessionId: string,
    tier: ModelTier,
    model: string,
    actualInputTokens: number,
    actualOutputTokens: number,
    taskType: string,
  ): void {
    const rec = costTracker.record(sessionId, tier, model, actualInputTokens, actualOutputTokens, taskType)
    console.log(`${LOG} Recorded ${rec.actualCostUSD.toFixed(5)} for ${tier} call`)
  }

  /** @returns Same shape as {@link costTracker.getSessionSummary}. */
  getSessionCostSummary(sessionId: string): SessionCostSummary {
    return costTracker.getSessionSummary(sessionId)
  }
}

/** Shared {@link ModelRouter} instance. */
export const modelRouter = new ModelRouter()
