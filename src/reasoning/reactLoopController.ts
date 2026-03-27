/**
 * Orchestrates the full multi-step Jarvis ReAct loop until completion, clarification,
 * step limit, or a hard failure.
 *
 * @module reasoning/reactLoopController
 */

import { v4 as uuidv4 } from 'uuid'

import ReActEngine, {
  type ReActEngineConfig,
  type ReActDecision,
} from './reactEngine'
import type { ReActTrace, Thought, Observation, ReActStep, Action } from './reactTypes'
import type { ActionOutcome } from './observationEvaluator'
import type { ThoughtContext } from './thoughtGenerator'
import { telemetry } from '@/lib/observability/telemetryCollector'

const LOG = '[ReActLoopController]'

type DecideOk = { ok: true; decision: ReActDecision }
type DecideErr = { ok: false; message: string }

type ExecuteOk = { ok: true; outcome: ActionOutcome }
type ExecuteErr = { ok: false; message: string; outcome: ActionOutcome }

type ObserveOk = { ok: true; action: Action; observation: Observation }
type ObserveErr = { ok: false; message: string }

/**
 * {@link ReActEngineConfig} plus optional streaming hooks for UI layers.
 */
export interface LoopConfig extends ReActEngineConfig {
  /** Fires after each {@link ReActEngine.decide} thought is chosen. */
  onThoughtGenerated?: (thought: Thought) => void
  /** Fires after each decision (thought + action) is produced. */
  onActionDecided?: (decision: ReActDecision) => void
  /** Fires after each observation is produced for an executed action. */
  onObservationMade?: (obs: Observation) => void
}

/**
 * Outcome of {@link ReActLoopController.run}: trace, terminal decision, flags, and summary.
 */
export interface LoopResult {
  trace: ReActTrace
  finalDecision: ReActDecision
  shouldExecuteWorker: boolean
  shouldRequestClarification: boolean
  shouldSearchWeb: boolean
  enrichedContext: ThoughtContext
  reasoningSummary: string
}

function cloneContext(base: ThoughtContext): ThoughtContext {
  return {
    ...base,
    priorSteps: [...base.priorSteps],
    ragContent: [...base.ragContent],
    accumulatedRisks: [...(base.accumulatedRisks ?? [])],
  }
}

function truncateText(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/**
 * Runs Thought → Action → Observation cycles until a terminal state.
 */
export default class ReActLoopController {
  private readonly config: LoopConfig
  private readonly _engine: ReActEngine

  /**
   * @param config - Engine options plus optional streaming callbacks.
   */
  constructor(config: LoopConfig) {
    this.config = config
    this._engine = new ReActEngine(config)
  }

  /** Use for single-step {@link ReActEngine.decide} from the Manager (full loop uses {@link run}). */
  get engine(): ReActEngine {
    return this._engine
  }

  /**
   * Drives the loop: {@link ReActEngine.decide}, optional execution, observe, record, enrich.
   *
   * @param initialContext - Starting task context (copied before mutation).
   * @param executeAction - Runs non-terminal actions and returns {@link ActionOutcome}.
   */
  async run(
    initialContext: ThoughtContext,
    executeAction: (decision: ReActDecision) => Promise<ActionOutcome>,
  ): Promise<LoopResult> {
    let context = cloneContext(initialContext)
    let lastDecision: ReActDecision | null = null
    let lastOutcome: ActionOutcome | null = null
    let loopFailed = false
    let failureMessage = ''

    const loopStart = Date.now()

    while (true) {
      const decided = await this._tryDecide(context)
      if (!decided.ok) {
        loopFailed = true
        failureMessage = decided.message
        break
      }

      const decision = decided.decision
      lastDecision = decision
      this.config.onThoughtGenerated?.(decision.thought)
      this.config.onActionDecided?.(decision)

      if (decision.action === 'complete' || decision.action === 'request_clarification') {
        break
      }

      const executed = await this._tryExecute(decision, executeAction)
      if (!executed.ok) {
        loopFailed = true
        failureMessage = executed.message
        lastOutcome = executed.outcome
        break
      }

      lastOutcome = executed.outcome

      const observed = await this._tryObserve(decision, executed.outcome)
      if (!observed.ok) {
        loopFailed = true
        failureMessage = observed.message
        break
      }

      const { action, observation } = observed
      this.config.onObservationMade?.(observation)

      const stepDurationMs = Date.now() - loopStart
      this._engine.recordStep(decision.thought, action, observation, stepDurationMs)

      const priorSteps: ReActStep[] = [...this._engine.getTrace().steps]
      context = this._enrichContext(context, decision.thought, observation, priorSteps)

      const completionOverride = await this._maybeCompletionOverride(
        initialContext.userMessage,
        decision,
        executed.outcome,
        observation,
      )
      if (completionOverride !== null) {
        lastDecision = completionOverride
        break
      }
    }

    if (lastDecision === null) {
      const placeholderThought: Thought = {
        id: uuidv4(),
        type: 'problem_analysis',
        content: failureMessage || 'No decision produced',
        taskType: this.config.taskType,
        confidence: 0,
        assumptions: [],
        risks: [],
        alternativesConsidered: [],
        timestamp: new Date().toISOString(),
        turnIndex: 0,
      }
      lastDecision = {
        action: 'complete',
        parameters: {},
        thought: placeholderThought,
        shouldContinue: false,
        finalAnswer: failureMessage || 'ReAct loop failed before first decision',
      }
    }

    const success =
      !loopFailed && lastDecision.action === 'complete'

    const answerForTrace =
      lastDecision.finalAnswer ??
      lastOutcome?.rawOutput ??
      (loopFailed ? failureMessage : '')

    const trace = this._engine.completeTrace(answerForTrace, success)

    return {
      trace,
      finalDecision: lastDecision,
      shouldExecuteWorker: lastDecision.action === 'execute_task',
      shouldRequestClarification:
        lastDecision.action === 'request_clarification',
      shouldSearchWeb: lastDecision.action === 'search_web',
      enrichedContext: context,
      reasoningSummary: this._buildReasoningSummary(trace),
    }
  }

  private async _tryDecide(context: ThoughtContext): Promise<DecideOk | DecideErr> {
    try {
      const decision = await this._engine.decide(context)
      return { ok: true, decision }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`${LOG} decide() failed`, err)
      telemetry.record('error', this.config.sessionId, {
        context: 'ReActLoopController.decide',
        message,
      })
      return { ok: false, message }
    }
  }

  private async _tryExecute(
    decision: ReActDecision,
    executeAction: (d: ReActDecision) => Promise<ActionOutcome>,
  ): Promise<ExecuteOk | ExecuteErr> {
    try {
      const outcome = await executeAction(decision)
      return { ok: true, outcome }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const outcome: ActionOutcome = {
        actionType: decision.action,
        rawOutput: '',
        success: false,
        error: message,
      }
      console.warn(`${LOG} executeAction failed`, err)
      telemetry.record('error', this.config.sessionId, {
        context: 'ReActLoopController.executeAction',
        message,
      })
      return { ok: false, message, outcome }
    }
  }

  private async _tryObserve(
    decision: ReActDecision,
    outcome: ActionOutcome,
  ): Promise<ObserveOk | ObserveErr> {
    try {
      const action = this._engine.buildAction(
        decision.thought,
        decision.action,
        decision.parameters,
      )
      const observation = await this._engine.observe(decision.thought, action, outcome)
      return { ok: true, action, observation }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`${LOG} observe() failed`, err)
      telemetry.record('error', this.config.sessionId, {
        context: 'ReActLoopController.observe',
        message,
      })
      return { ok: false, message }
    }
  }

  /**
   * When the model agrees the task is done, force a terminal {@link ReActDecision}.
   */
  private async _maybeCompletionOverride(
    originalUserMessage: string,
    decision: ReActDecision,
    outcome: ActionOutcome,
    observation: Observation,
  ): Promise<ReActDecision | null> {
    if (observation.status !== 'success' || !observation.meetsExpectation) {
      return null
    }
    try {
      const completionCheck = await this._engine.evaluateCompletion(
        originalUserMessage,
        outcome.rawOutput,
        this.config.taskType,
      )
      if (
        completionCheck.isComplete &&
        completionCheck.completionScore >= 0.8
      ) {
        return {
          ...decision,
          action: 'complete',
          parameters: {},
          shouldContinue: false,
          finalAnswer: outcome.rawOutput.slice(0, 8000),
        }
      }
    } catch (err) {
      console.warn(`${LOG} evaluateCompletion failed, continuing loop`, err)
    }
    return null
  }

  /**
   * Merges the latest observation, step history, iteration signal, and accumulated risks.
   */
  private _enrichContext(
    context: ThoughtContext,
    thought: Thought,
    observation: Observation,
    priorSteps: ReActStep[],
  ): ThoughtContext {
    const prevRisks = context.accumulatedRisks ?? []
    const mergedRisks = [...prevRisks, ...thought.risks]
    const iterationCount =
      observation.status !== 'success'
        ? context.iterationCount + 1
        : context.iterationCount

    return {
      ...context,
      priorSteps,
      lastObservation: observation.content.slice(0, 2500),
      iterationCount,
      accumulatedRisks: mergedRisks,
      taskType: this.config.taskType,
    }
  }

  /**
   * Short narrative for logs or UI from the finished {@link ReActTrace}.
   */
  private _buildReasoningSummary(trace: ReActTrace): string {
    let lastProblem = ''
    let lastPlan = ''
    for (const s of trace.steps) {
      if (s.thought.type === 'problem_analysis') {
        lastProblem = s.thought.content
      }
      if (s.thought.type === 'plan_formation') {
        lastPlan = s.thought.content
      }
    }
    const outcomeStatus =
      trace.steps.length > 0
        ? trace.steps[trace.steps.length - 1]!.observation.status
        : 'none'

    return (
      `Completed ${trace.steps.length} reasoning steps for ${trace.taskType} task.\n` +
      `Key insight: ${truncateText(lastProblem || '(none)', 100)}\n` +
      `Approach: ${truncateText(lastPlan || '(none)', 100)}\n` +
      `Outcome: ${outcomeStatus}`
    )
  }
}
