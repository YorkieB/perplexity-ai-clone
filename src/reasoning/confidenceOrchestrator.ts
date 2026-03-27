/**
 * Single entry point for Jarvis confidence scoring: System 1 (elicitation + vector),
 * UAM propagation ({@link confidenceMemoryStore}), and System 2 UAR
 * ({@link UncertaintyResolver}) when policy calls for it.
 *
 * @module reasoning/confidenceOrchestrator
 */

import ConfidenceElicitor from './confidenceElicitor'
import { confidenceMemoryStore } from './confidenceMemoryStore'
import type { ConfidenceScore } from './confidenceTypes'
import { CONFIDENCE_THRESHOLDS, scoreToAction, scoreToLevel } from './confidenceTypes'
import UncertaintyResolver, { type UARResult } from './uncertaintyResolver'

const LOG = '[ConfidenceOrchestrator]'

/** Inputs for one {@link ConfidenceOrchestrator.evaluate} call. */
export interface ConfidenceOrchestratorConfig {
  sessionId: string
  taskType: string
  taskDescription: string
  turnIndex: number
  complexityScore: number
  iterationNumber?: number
  /** Expensive multi-sample check — default `false`. */
  enableConsistencyCheck?: boolean
}

/** Outcome of elicitation, optional UAR, and policy flags for the pipeline. */
export interface ConfidenceResult {
  score: ConfidenceScore
  /** Present when System 2 ran (trigger/escalate paths). */
  uarResult?: UARResult
  /** User-visible text, possibly rewritten by UAR. */
  finalOutput: string
  /** When {@link ConfidenceScore.recommendedAction} is `request_clarification`. */
  shouldBlock: boolean
  /** When UAR recommends model escalation. */
  shouldEscalate: boolean
  /** Short disclosure for `proceed_with_flag`. */
  uncertaintyNotice?: string
  sessionRollingAverage: number
  sessionTrend: string
}

/**
 * Coordinates {@link ConfidenceElicitor}, {@link confidenceMemoryStore}, and {@link UncertaintyResolver}.
 */
export default class ConfidenceOrchestrator {
  private readonly elicitor: ConfidenceElicitor
  private readonly resolver: UncertaintyResolver

  constructor() {
    this.elicitor = new ConfidenceElicitor()
    this.resolver = new UncertaintyResolver()
  }

  /**
   * Runs System 1 → UAM record → optional consistency → System 2 → notices.
   */
  async evaluate(
    output: string,
    config: ConfidenceOrchestratorConfig,
    existingScores?: {
      critiqueScore?: number
      observationMet?: boolean
      ragQuality?: number
    },
  ): Promise<ConfidenceResult> {
    const iterationNumber = config.iterationNumber ?? 0

    const elicited = await this.elicitor.elicit(
      output,
      config.taskDescription,
      config.taskType,
      config.sessionId,
      config.turnIndex,
    )

    let finalScalar = elicited.scalar

    if (existingScores !== undefined && Object.keys(existingScores).length > 0) {
      const vector = this.elicitor.computeVector({
        critique: existingScores.critiqueScore,
        observation: existingScores.observationMet,
        ragHits: existingScores.ragQuality,
        verbalized: elicited.scalar,
      })
      finalScalar = vector.overall
      elicited.scalar = finalScalar
      elicited.source = 'composite'
    }

    elicited.level = scoreToLevel(finalScalar)
    elicited.recommendedAction = scoreToAction(
      finalScalar,
      config.complexityScore,
      iterationNumber,
    )

    let memory = confidenceMemoryStore.record(config.sessionId, elicited)

    if (confidenceMemoryStore.isConfidenceDegrading(config.sessionId)) {
      console.warn(
        `${LOG} ⚠ Confidence degrading in session ${config.sessionId} — UAM context active`,
      )
    }

    if (config.enableConsistencyCheck === true && elicited.scalar >= 0.7) {
      const consistency = await this.elicitor.checkConsistency(
        config.taskDescription,
        output,
        config.taskType,
      )
      if (!consistency.consistent) {
        elicited.scalar = Math.max(
          elicited.scalar - 0.15,
          CONFIDENCE_THRESHOLDS.HARD_BLOCK,
        )
        elicited.level = scoreToLevel(elicited.scalar)
        elicited.recommendedAction = scoreToAction(
          elicited.scalar,
          config.complexityScore,
          iterationNumber,
        )
        elicited.uncertaintyFactors.push(
          `Consistency check failed: ${consistency.variance}`,
        )
        memory = confidenceMemoryStore.record(config.sessionId, elicited)
      }
    }

    let uarResult: UARResult | undefined
    let finalOutput = output

    if (
      elicited.recommendedAction === 'trigger_uar' ||
      elicited.recommendedAction === 'escalate_model'
    ) {
      uarResult = await this.resolver.resolve(
        elicited,
        output,
        config.taskDescription,
        config.sessionId,
        config.taskType,
      )
      if (uarResult.resolvedContent !== undefined && uarResult.resolvedContent.length > 0) {
        finalOutput = uarResult.resolvedContent
        const improvedScore: ConfidenceScore = {
          ...elicited,
          scalar: uarResult.resolvedScore,
          level: scoreToLevel(uarResult.resolvedScore),
          recommendedAction: scoreToAction(
            uarResult.resolvedScore,
            config.complexityScore,
            iterationNumber,
          ),
          timestamp: new Date().toISOString(),
        }
        elicited.scalar = improvedScore.scalar
        elicited.level = improvedScore.level
        elicited.recommendedAction = improvedScore.recommendedAction
        memory = confidenceMemoryStore.record(config.sessionId, improvedScore)
      }
    }

    let uncertaintyNotice: string | undefined
    if (elicited.recommendedAction === 'proceed_with_flag') {
      uncertaintyNotice = this._buildUncertaintyNotice(elicited)
    }

    return {
      score: elicited,
      uarResult,
      finalOutput,
      shouldBlock: elicited.recommendedAction === 'request_clarification',
      shouldEscalate: uarResult?.modelEscalation ?? false,
      uncertaintyNotice,
      sessionRollingAverage: memory.rollingAverage,
      sessionTrend: memory.trend,
    }
  }

  /** Short user-facing disclosure (max ~3 sentences). */
  private _buildUncertaintyNotice(score: ConfidenceScore): string {
    const pct = Math.round(score.scalar * 100)
    const parts: string[] = [`⚠ Confidence note: I'm ${String(pct)}% confident in this response.`]
    if (score.uncertaintyFactors.length > 0) {
      parts.push(
        `Areas of uncertainty: ${score.uncertaintyFactors.slice(0, 2).join(', ')}.`,
      )
    }
    if (score.knowledgeGaps.length > 0) {
      parts.push(`This could be improved with: ${score.knowledgeGaps[0]}.`)
    }
    return parts.join(' ')
  }
}

/** Shared {@link ConfidenceOrchestrator} instance. */
export const confidenceOrchestrator = new ConfidenceOrchestrator()
