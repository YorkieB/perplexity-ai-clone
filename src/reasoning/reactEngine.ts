/**
 * Coordinates the Jarvis ReAct loop: {@link Thought} → {@link Action} → {@link Observation}.
 *
 * @module reasoning/reactEngine
 */

import { v4 as uuidv4 } from 'uuid'

import ThoughtGenerator, { type ThoughtContext } from './thoughtGenerator'
import HypothesisTracker from './hypothesisTracker'
import ObservationEvaluator, { type ActionOutcome } from './observationEvaluator'
import { modelRouter, type RouterResult } from './modelRouter'
import ToTOrchestrator, { type ToTDecision } from './totOrchestrator'
import { confidenceMemoryStore } from './confidenceMemoryStore'
import { confidenceOrchestrator } from './confidenceOrchestrator'
import { scratchpadStore } from './scratchpadStore'
import type {
  Thought,
  Action,
  Observation,
  ReActStep,
  ReActTrace,
  ActionType,
  ThoughtType,
} from './reactTypes'
import { MAX_REACT_STEPS, THOUGHT_CONFIDENCE_THRESHOLD } from './reactTypes'
import { telemetry } from '@/lib/observability/telemetryCollector'

const LOG = '[ReActEngine]'

/**
 * Runtime options for a single {@link ReActEngine} instance.
 */
export interface ReActEngineConfig {
  /** Model id passed to {@link ThoughtGenerator} (default that class’s default). */
  model?: string
  /** Max Thought → Action → Observation cycles (defaults to {@link MAX_REACT_STEPS}). */
  maxSteps?: number
  /** Minimum thought confidence before acting (defaults to {@link THOUGHT_CONFIDENCE_THRESHOLD}). */
  confidenceThreshold?: number
  /** When true, {@link decide} may block `execute_task` via {@link ThoughtGenerator.generateUncertaintyCheck}. */
  enableUncertaintyChecks?: boolean
  /** Semantic / intent route for this session task. */
  taskType: string
  /** Session id for telemetry correlation. */
  sessionId: string
  /**
   * Optional. When provided, {@link ReActEngine.observe} will automatically:
   * - Update the active hypothesis via {@link HypothesisTracker}
   * - Invalidate contradicted assumptions
   * - Record dead ends on failure observations
   * - Add insights on success observations
   *
   * **WARNING:** If `scratchpadId` is omitted, all scratchpad side effects
   * in `observe()` are silently skipped. Always pass `scratchpadId` when
   * running a full ReAct loop inside ManagerAgent or MWOrchestrator.
   * Omit only for lightweight single-step reasoning where no
   * persistent scratchpad is needed.
   */
  scratchpadId?: string
  /** When false, Tree-of-Thoughts is not run before the first Thought (default true). */
  totEnabled?: boolean
  /** Task requirements forwarded to ToT scoring ({@link ToTOrchestrator}). */
  taskRequirements?: string[]
  /** RAG or other snippets forwarded to ToT scoring. */
  availableContext?: string[]
  /** When set with {@link sessionId}, {@link think} pre-routes once and passes {@link ThoughtContext.routedModel}. */
  complexityScore?: number
}

/**
 * One planning decision: chosen action, parameters, and the authorising {@link Thought}.
 */
export interface ReActDecision {
  action: ActionType
  parameters: Record<string, unknown>
  thought: Thought
  /** Whether the outer loop should keep driving ReAct in this turn. */
  shouldContinue: boolean
  /** Populated when forcing terminal completion. */
  finalAnswer?: string
}

function isKnowledgeTaskType(taskType: string): boolean {
  const t = taskType.trim().toLowerCase()
  return t === 'knowledge_lookup' || t.includes('knowledge')
}

function createInitialTrace(sessionId: string, taskType: string): ReActTrace {
  return {
    traceId: uuidv4(),
    sessionId,
    taskType,
    steps: [],
    totalThoughts: 0,
    totalActions: 0,
    completedSuccessfully: false,
    startedAt: new Date().toISOString(),
    totalDurationMs: 0,
  }
}

/**
 * Task text for ToT: include {@link ThoughtContext.taskBrief} when set so the Manager brief
 * (including pre-task enrichment from {@link ManagerWorkerOrchestrator}) flows into branch
 * scoring, not only raw {@link ThoughtContext.userMessage}.
 */
function buildTotTaskDescription(ctx: ThoughtContext): string {
  const um = ctx.userMessage.trim()
  const brief = ctx.taskBrief?.trim() ?? ''
  if (brief.length === 0) return um
  if (um.length === 0) return brief
  return `${um}\n\n---\n\nManager brief:\n${brief}`
}

function proposedActionLabel(action: ActionType, parameters: Record<string, unknown>): string {
  const payload = JSON.stringify({ action, parameters })
  return payload.length > 400 ? `${payload.slice(0, 397)}...` : payload
}

/**
 * Stateful coordinator for one ReAct trace.
 */
export default class ReActEngine {
  private readonly config: ReActEngineConfig
  private readonly thoughtGenerator: ThoughtGenerator
  private readonly observationEvaluator: ObservationEvaluator
  private readonly hypothesisTracker: HypothesisTracker
  private readonly totOrchestrator: ToTOrchestrator
  private lastTotDecision: ToTDecision | null = null
  private routerResult: RouterResult | null = null
  private currentTrace: ReActTrace

  /**
   * @param config - Session/task identity and optional thresholds.
   */
  constructor(config: ReActEngineConfig) {
    this.config = {
      ...config,
      enableUncertaintyChecks: config.enableUncertaintyChecks ?? true,
      totEnabled: config.totEnabled ?? true,
    }
    this.thoughtGenerator = new ThoughtGenerator(config.model)
    this.observationEvaluator = new ObservationEvaluator()
    this.hypothesisTracker = new HypothesisTracker()
    this.totOrchestrator = new ToTOrchestrator()
    this.currentTrace = createInitialTrace(config.sessionId, config.taskType)
    console.log(`${LOG} Initialised for task: ${config.taskType}`)
  }

  private confidenceThreshold(): number {
    return this.config.confidenceThreshold ?? THOUGHT_CONFIDENCE_THRESHOLD
  }

  private maxSteps(): number {
    return this.config.maxSteps ?? MAX_REACT_STEPS
  }

  /** Merges engine `scratchpadId` into the trace context for Thought prompts. */
  private withScratchpadContext(context: ThoughtContext): ThoughtContext {
    return {
      ...context,
      scratchpadId: context.scratchpadId ?? this.config.scratchpadId,
    }
  }

  /**
   * Generates a Thought and deepens analysis if confidence is too low.
   * If the first Thought scores below THOUGHT_CONFIDENCE_THRESHOLD and
   * no forceThoughtType was given, a second 'uncertainty_check' Thought
   * is generated and the higher-confidence result is returned.
   * This deepening logic lives here (not in ThoughtGenerator) because
   * ReActEngine owns confidence policy — ThoughtGenerator is stateless.
   */
  async think(
    context: ThoughtContext,
    forceThoughtType?: ThoughtType,
  ): Promise<Thought> {
    let ctx = this.withScratchpadContext(context)
    if (this.config.sessionId.length > 0) {
      ctx = { ...ctx, sessionId: this.config.sessionId }
    }
    if (this.config.sessionId.length > 0 && this.config.complexityScore !== undefined) {
      this.routerResult = await modelRouter.route({
        sessionId: this.config.sessionId,
        taskType: this.config.taskType,
        taskDescription: ctx.userMessage,
        complexityScore: this.config.complexityScore,
        iterationNumber: ctx.iterationCount,
        estimatedOutputLength: 'short',
      })
      ctx = {
        ...ctx,
        complexityScore: this.config.complexityScore,
        routedModel: this.routerResult.model,
        routedTier: this.routerResult.tier,
      }
    }
    if (this.config.sessionId.length > 0) {
      const uamContext = confidenceMemoryStore.buildUAMContext(this.config.sessionId)
      if (uamContext.length > 0) {
        ctx = {
          ...ctx,
          userMessage: `${ctx.userMessage}\n\n${uamContext}`,
        }
      }
    }
    let thought = await this.thoughtGenerator.generate(ctx, forceThoughtType)

    telemetry.record('react_thought', this.config.sessionId, {
      thoughtId: thought.id,
      type: thought.type,
      confidence: thought.confidence,
      stepIndex: this.currentTrace.steps.length,
      taskType: this.config.taskType,
    })

    const threshold = this.confidenceThreshold()
    if (
      thought.confidence < threshold &&
      forceThoughtType === undefined
    ) {
      console.log(
        `${LOG} Low confidence (${thought.confidence}), deepening analysis...`,
      )
      const second = await this.thoughtGenerator.generate(ctx, 'uncertainty_check')
      thought =
        second.confidence > thought.confidence ? second : thought
    }

    return thought
  }

  /**
   * Materialises an {@link Action} linked to a {@link Thought}.
   */
  buildAction(
    thought: Thought,
    actionType: ActionType,
    parameters: Record<string, unknown>,
  ): Action {
    const action: Action = {
      id: uuidv4(),
      type: actionType,
      description: `${actionType}: ${thought.content.slice(0, 160)}`,
      parameters,
      triggeredByThoughtId: thought.id,
      timestamp: new Date().toISOString(),
    }
    console.log(`${LOG} Action built: ${actionType} (from thought ${thought.id})`)
    return action
  }

  /**
   * Evaluates an action outcome and updates the CoT Scratchpad if
   * `config.scratchpadId` is set. If not set, observation is still
   * returned but hypothesis/assumption/dead-end tracking is skipped.
   *
   * Wraps {@link ObservationEvaluator.evaluate} and records telemetry.
   */
  async observe(
    thought: Thought,
    action: Action,
    outcome: ActionOutcome,
  ): Promise<Observation> {
    const observation = await this.observationEvaluator.evaluate(thought, action, outcome)

    telemetry.record('react_observation', this.config.sessionId, {
      observationId: observation.id,
      status: observation.status,
      meetsExpectation: observation.meetsExpectation,
      stepIndex: this.currentTrace.steps.length,
    })

    const sid = this.config.scratchpadId
    if (sid) {
      try {
        await this.hypothesisTracker.updateFromObservation(
          sid,
          observation.content,
          observation.status,
        )

        const violatedAssumptions = await this.hypothesisTracker.detectAssumptionViolation(
          sid,
          observation.content,
        )
        for (const assumptionId of violatedAssumptions) {
          scratchpadStore.invalidateAssumption(
            sid,
            assumptionId,
            `Observation (${observation.status}) contradicted this assumption`,
          )
        }

        if (observation.status === 'failure') {
          scratchpadStore.recordDeadEnd(sid, {
            approach: action.description ?? 'Unknown action',
            whyItFailed: observation.content.slice(0, 200),
            avoidanceHint: observation.nextThoughtHint ?? 'Review approach before retrying',
          })
        }

        if (observation.status === 'success' && observation.content.length > 50) {
          scratchpadStore.addInsight(
            sid,
            observation.content.slice(0, 150),
            'medium',
          )
        }
      } catch (err) {
        console.warn(`${LOG} Scratchpad sync after observation failed`, err)
      }
    }

    if (this.config.sessionId.length > 0) {
      /**
       * NOTE: Confidence evaluation in observe() records the UAM score and
       * may trigger UAR resolution internally, but does NOT replace
       * observation.content with the UAR-resolved output.
       *
       * Design rationale: ReAct observations represent what ACTUALLY HAPPENED
       * (tool return values, API responses, execution results). These are ground
       * truth — they should not be rewritten by UAR, which is a reasoning layer.
       *
       * UAR substitution only applies to GENERATED content (Worker outputs).
       * Observation confidence scores still propagate forward via UAM, so
       * low-confidence observations inform subsequent Thoughts correctly.
       *
       * If observation-level UAR substitution is needed in future, it should
       * only apply to the nextThoughtHint (already done), not observation.content.
       */
      const confidenceResult = await confidenceOrchestrator.evaluate(
        observation.content,
        {
          sessionId: this.config.sessionId,
          taskType: this.config.taskType,
          taskDescription: thought.content,
          turnIndex: this.currentTrace.steps.length,
          complexityScore: this.config.complexityScore ?? 0.5,
          iterationNumber: thought.turnIndex,
        },
        {
          observationMet: observation.meetsExpectation,
        },
      )

      if (confidenceResult.shouldBlock) {
        observation.nextThoughtHint =
          'Confidence too low — request clarification before proceeding'
        console.warn(
          `${LOG} ⚠ Confidence blocked: ${String(confidenceResult.score.scalar)}`,
        )
      }

      if (confidenceResult.shouldEscalate) {
        console.warn(`${LOG} ⚠ Confidence escalation flagged for next attempt`)
      }
    }

    return observation
  }

  /**
   * Appends a completed cycle to {@link currentTrace}.
   */
  recordStep(
    thought: Thought,
    action: Action,
    observation: Observation,
    durationMs: number,
  ): ReActStep {
    const stepIndex = this.currentTrace.steps.length
    const step: ReActStep = {
      stepIndex,
      thought,
      action,
      observation,
      durationMs,
    }
    this.currentTrace.steps.push(step)
    this.currentTrace.totalThoughts = this.currentTrace.steps.length
    this.currentTrace.totalActions = this.currentTrace.steps.length
    return step
  }

  /**
   * Runs {@link ToTOrchestrator} once per trace (first step only) when enabled.
   */
  async runToTIfNeeded(taskDescription: string): Promise<ToTDecision> {
    if (this.config.totEnabled === false) {
      const decision: ToTDecision = {
        shouldUseTot: false,
        complexityLevel: 'simple',
        complexityScore: 0,
        skippedReason: 'ToT disabled by config',
      }
      this.lastTotDecision = decision
      return decision
    }

    if (this.currentTrace.steps.length > 0) {
      return {
        shouldUseTot: false,
        complexityLevel: 'simple',
        complexityScore: 0,
        skippedReason: 'Mid-trace ToT disabled',
      }
    }

    const decision = await this.totOrchestrator.run({
      sessionId: this.config.sessionId,
      taskType: this.config.taskType,
      taskDescription,
      requirements: this.config.taskRequirements ?? [],
      availableContext: this.config.availableContext ?? [],
    })

    this.lastTotDecision = decision

    if (decision.shouldUseTot) {
      console.log(
        `${LOG} ToT selected approach: ${decision.selectedApproach ?? '?'} (complexity: ${decision.complexityLevel}, explored: ${String(decision.result?.nodesExplored ?? 0)} nodes)`,
      )
    } else {
      console.log(`${LOG} ToT skipped: ${decision.skippedReason ?? 'unknown'}`)
    }

    return decision
  }

  /** Last Tree-of-Thoughts decision from this engine (or null before any first-step run). */
  getLastTotDecision(): ToTDecision | null {
    return this.lastTotDecision
  }

  private mapThoughtToAction(
    thought: Thought,
    context: ThoughtContext,
  ): { action: ActionType; parameters: Record<string, unknown> } {
    const hasRag = context.ragContent.length > 0
    const knowledge = isKnowledgeTaskType(this.config.taskType)

    if (thought.type === 'problem_analysis' && !hasRag && knowledge) {
      return { action: 'retrieve_context', parameters: {} }
    }
    if (thought.type === 'problem_analysis' && hasRag) {
      return { action: 'execute_task', parameters: {} }
    }
    if (thought.type === 'plan_formation') {
      return { action: 'execute_task', parameters: {} }
    }
    if (thought.type === 'error_diagnosis') {
      return { action: 'execute_task', parameters: {} }
    }
    if (thought.type === 'refinement_reasoning') {
      return { action: 'execute_task', parameters: {} }
    }
    if (thought.type === 'uncertainty_check' && thought.confidence < 0.5) {
      return { action: 'request_clarification', parameters: {} }
    }
    if (thought.type === 'completion_check') {
      return { action: 'complete', parameters: {} }
    }
    if (thought.type === 'observation_analysis') {
      return { action: 'execute_task', parameters: {} }
    }
    return { action: 'execute_task', parameters: {} }
  }

  /**
   * Generates a reasoning Thought and returns the recommended Action.
   *
   * TWO-PHASE DESIGN:
   * Phase 1 — Rule-based mapping (no LLM call):
   *   mapThoughtToAction() converts ThoughtType → ActionType deterministically.
   *   This is fast and predictable.
   *
   * Phase 2 — Optional uncertainty check (may make LLM call):
   *   If enableUncertaintyChecks is true AND the mapped action is 'execute_task',
   *   generateUncertaintyCheck() runs an additional LLM safety check.
   *   This can override 'execute_task' to 'request_clarification' if confidence
   *   is genuinely too low to proceed safely.
   *
   * So: action SELECTION is always rule-based.
   *     action SAFETY CHECK may involve an LLM call.
   *     The two are distinct and intentional.
   */
  async decide(context: ThoughtContext): Promise<ReActDecision> {
    const limit = this.maxSteps()
    if (this.currentTrace.steps.length >= limit) {
      const thought = await this.think(context, 'completion_check')
      return {
        action: 'complete',
        parameters: {},
        thought,
        shouldContinue: false,
        finalAnswer:
          'Maximum reasoning steps reached — returning best available answer',
      }
    }

    let thoughtContext = this.withScratchpadContext(context)
    let totContext = ''
    if (thoughtContext.priorSteps.length === 0 && this.config.totEnabled !== false) {
      // NOTE: ToT runs at step 2 of the execution order.
      // Pre-task confidence gate (step 1) has already run in the Orchestrator.
      // If pre-task returned shouldProceed=false, we never reach here.
      // If pre-task injected a suggestedApproach into the brief,
      // ToT evaluates it as one of the candidate branches but is not
      // bound to it — ToT may select a different approach if it scores higher.
      const totTaskDescription = buildTotTaskDescription(thoughtContext)
      const totDecision = await this.runToTIfNeeded(totTaskDescription)
      totContext = await this.totOrchestrator.getSelectedApproachForPrompt(totDecision)
    }
    // NOTE: ToT XML is NOT re-injected on subsequent steps.
    // The selected approach is already written to the CoT Scratchpad
    // as a high-importance insight by ToTOrchestrator.run(), so all
    // subsequent Thoughts are informed via buildScratchpadSummary().
    if (totContext.length > 0) {
      thoughtContext = {
        ...thoughtContext,
        userMessage: `${thoughtContext.userMessage}\n\n${totContext}`,
      }
    }

    const thought = await this.think(thoughtContext)
    let { action, parameters } = this.mapThoughtToAction(thought, thoughtContext)

    const checksEnabled = this.config.enableUncertaintyChecks !== false
    if (checksEnabled && action === 'execute_task') {
      const label = proposedActionLabel(action, parameters)
      const check = await this.thoughtGenerator.generateUncertaintyCheck(
        this.withScratchpadContext(thoughtContext),
        label,
      )
      if (!check.shouldProceed) {
        console.log(
          `${LOG} Uncertainty check blocked execution: ${check.reason}`,
        )
        action = 'request_clarification'
        parameters = {}
      }
    }

    const shouldContinue =
      action !== 'complete' && action !== 'request_clarification'

    return {
      action,
      parameters,
      thought,
      shouldContinue,
    }
  }

  /**
   * Finalises the trace with an answer and success flag.
   */
  completeTrace(finalAnswer: string, success: boolean): ReActTrace {
    this.currentTrace.finalAnswer = finalAnswer
    this.currentTrace.completedSuccessfully = success
    this.currentTrace.completedAt = new Date().toISOString()
    const started = new Date(this.currentTrace.startedAt).getTime()
    this.currentTrace.totalDurationMs = Math.max(0, Date.now() - started)

    telemetry.record('react_trace_complete', this.config.sessionId, {
      traceId: this.currentTrace.traceId,
      steps: this.currentTrace.steps.length,
      success,
      durationMs: this.currentTrace.totalDurationMs,
      taskType: this.config.taskType,
    })

    console.log(
      `${LOG} Trace complete: ${this.currentTrace.steps.length} steps, success: ${success}`,
    )
    return this.currentTrace
  }

  /** Current in-flight trace (do not mutate from outside). */
  getTrace(): ReActTrace {
    return this.currentTrace
  }

  /** Observation from the latest recorded step, if any. */
  getLastObservation(): Observation | null {
    const steps = this.currentTrace.steps
    if (steps.length === 0) return null
    return steps[steps.length - 1]!.observation
  }

  /** Starts a new trace while keeping the same config. */
  reset(): void {
    this.currentTrace = createInitialTrace(this.config.sessionId, this.config.taskType)
    this.lastTotDecision = null
    this.routerResult = null
    console.log(`${LOG} Trace reset`)
  }

  /**
   * Whether {@link finalOutput} satisfies {@link originalRequest} (for loop termination).
   */
  async evaluateCompletion(
    originalRequest: string,
    finalOutput: string,
    taskTypeOverride?: string,
  ): Promise<{
    isComplete: boolean
    completionScore: number
    missingElements: string[]
  }> {
    return this.observationEvaluator.evaluateCompletion(
      originalRequest,
      finalOutput,
      taskTypeOverride ?? this.config.taskType,
    )
  }
}
