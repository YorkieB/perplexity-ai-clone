/**
 * Single entry point for Jarvis Tree-of-Thoughts: complexity gate, beam search, scratchpad, telemetry.
 *
 * @module reasoning/totOrchestrator
 */

import { telemetry } from '@/lib/observability/telemetryCollector'

import type { ScoringContext } from './branchScorer'
import BeamSearchController from './beamSearchController'
import ComplexityDetector from './complexityDetector'
import { scratchpadStore } from './scratchpadStore'
import { createTree, type ToTResult, type ToTTree, type TotConfigDefaults } from './totTypes'

const LOG = '[ToTOrchestrator]'

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Inputs needed to run the ToT pipeline for one task.
 */
export interface ToTOrchestratorConfig {
  sessionId: string
  taskType: string
  taskDescription: string
  requirements: string[]
  availableContext: string[]
}

/**
 * Outcome of {@link ToTOrchestrator.run}: whether ToT ran and what to inject downstream.
 */
export interface ToTDecision {
  shouldUseTot: boolean
  complexityLevel: string
  complexityScore: number
  result?: ToTResult
  selectedApproach?: string
  selectedThought?: string
  alternatives?: string[]
  searchSummary?: string
  skippedReason?: string
}

/**
 * Coordinates {@link ComplexityDetector}, {@link BeamSearchController}, scratchpad updates, and telemetry.
 */
export default class ToTOrchestrator {
  private readonly complexityDetector: ComplexityDetector

  constructor() {
    this.complexityDetector = new ComplexityDetector()
  }

  /**
   * Assesses complexity; if high enough, builds a tree, runs beam search, and records the outcome.
   */
  async run(config: ToTOrchestratorConfig): Promise<ToTDecision> {
    const pad = scratchpadStore.getForSession(config.sessionId)
    const assessment = await this.complexityDetector.assess(
      config.taskDescription,
      config.taskType,
      pad,
    )

    console.log(
      `${LOG} Complexity: ${assessment.level} (${assessment.score.toFixed(2)}) — useTot: ${String(assessment.useTot)}`,
    )

    if (!assessment.useTot) {
      telemetry.record('tot_decision', config.sessionId, {
        complexityLevel: assessment.level,
        complexityScore: assessment.score,
        usedTot: false,
        taskType: config.taskType,
      })
      return {
        shouldUseTot: false,
        complexityLevel: assessment.level,
        complexityScore: assessment.score,
        skippedReason: assessment.reasoning,
        selectedApproach: undefined,
      }
    }

    const tree: ToTTree = createTree(config.sessionId, config.taskType, config.taskDescription, {
      BEAM_WIDTH: assessment.totConfig.beamWidth,
      BRANCH_FACTOR: assessment.totConfig.branchFactor,
      MAX_DEPTH: assessment.totConfig.maxDepth,
    } as Partial<TotConfigDefaults>)

    const scoringContext: ScoringContext = {
      taskDescription: config.taskDescription,
      taskType: config.taskType,
      sessionId: config.sessionId,
      requirements: config.requirements,
      availableContext: config.availableContext,
    }

    const beamSearch = new BeamSearchController({
      beamWidth: assessment.totConfig.beamWidth,
      branchFactor: assessment.totConfig.branchFactor,
      maxDepth: assessment.totConfig.maxDepth,
      scoringContext,
      sessionId: config.sessionId,
    })

    const result = await beamSearch.search(tree)

    if (pad !== null) {
      scratchpadStore.addInsight(
        pad.scratchpadId,
        `ToT selected approach: ${result.bestApproach} (confidence: ${result.confidence.toFixed(2)})`,
        'high',
      )
      scratchpadStore.updateHypothesis(pad.scratchpadId, {
        statement: result.bestThought,
        confidence: result.confidence,
        supportingEvidence: result.alternativeApproaches.map((a) => `Evaluated alternative: ${a}`),
        contradictingEvidence: [],
        status: 'active',
      })
    }

    telemetry.record('tot_decision', config.sessionId, {
      complexityLevel: assessment.level,
      complexityScore: assessment.score,
      usedTot: true,
      nodesExplored: result.nodesExplored,
      bestScore: result.selectedNode.score,
      taskType: config.taskType,
    })

    return {
      shouldUseTot: true,
      complexityLevel: assessment.level,
      complexityScore: assessment.score,
      result,
      selectedApproach: result.bestApproach,
      selectedThought: result.bestThought,
      alternatives: result.alternativeApproaches,
      searchSummary: result.searchSummary,
    }
  }

  /**
   * Builds a compact XML block for Thought/Worker prompts from a prior {@link ToTDecision}.
   */
  async getSelectedApproachForPrompt(decision: ToTDecision): Promise<string> {
    if (!decision.shouldUseTot) {
      return ''
    }

    const approach = escapeXmlText(decision.selectedApproach ?? '')
    const reasoning = escapeXmlText(decision.selectedThought ?? '')
    const conf =
      decision.result !== undefined ? decision.result.confidence.toFixed(2) : '0.00'
    const alts = (decision.alternatives ?? []).map((a) => `- ${escapeXmlText(a)}`).join('\n')
    const summary = escapeXmlText(decision.searchSummary ?? '')

    return `<tot_selected_approach>
<approach>${approach}</approach>
<reasoning>${reasoning}</reasoning>
<confidence>${conf}</confidence>
<alternatives_considered>
${alts}
</alternatives_considered>
<search_summary>${summary}</search_summary>
</tot_selected_approach>
`
  }
}
