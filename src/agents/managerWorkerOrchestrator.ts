/**
 * Coordinates {@link ManagerAgent}, {@link WorkerAgent}, and {@link ReflexionController} for the Jarvis Manager–Worker flow.
 */

import ManagerAgent from './managerAgent'
import WorkerAgent, { type WorkerResult } from './workerAgent'
import type { TaskState, TaskType } from './taskState'
import type { RouteResult } from '@/lib/router/semanticRouter'
import SessionIndex from '@/memory/sessionIndex'
import { telemetry } from '@/lib/observability/telemetryCollector'
import ReflexionController, { MAX_REFLEXION_ITERATIONS } from '@/reasoning/reflexionController'
import ComplexityDetector from '@/reasoning/complexityDetector'
import { lessonsStore } from '@/reasoning/lessonsStore'
import ReActLoopController from '@/reasoning/reactLoopController'
import type { ReActTrace } from '@/reasoning/reactTypes'
import ConfidenceElicitor from '@/reasoning/confidenceElicitor'
import type { PreTaskEstimate } from '@/reasoning/confidenceTypes'
import { confidenceMemoryStore } from '@/reasoning/confidenceMemoryStore'
import { confidenceOrchestrator } from '@/reasoning/confidenceOrchestrator'
import type { ReflexionResult } from '@/reasoning/reflexionController'

const LOG = '[MWOrchestrator]'
const PRE_TASK_LOG = '[MWOrchestrator]'

// NOTE: These routes use ReAct (planning) + Reflexion (quality).
// ReAct handles Thought→Action→Observation structure.
// Reflexion handles critique and verbal reinforcement.
// Both run on every Worker execution for these routes.
/** Intent routes that run the full Thought → Action → Observation loop before returning. */
const FULL_REACT_ROUTES = new Set<TaskType>([
  'code_instruction',
  'voice_task',
  'image_task',
  'browser_task',
])

/**
 * Clarification-only outcome: pre-task gate, confidence hard-block, Manager/ReAct clarify, etc.
 * API layer maps to `metadata.type: 'clarification_required'` for the UI.
 */
export interface MWOrchestratorClarificationRequired {
  type: 'clarification_required'
  /** User-facing clarification text (mirrors {@link response}). */
  question: string
  /** Same as {@link question}; kept for callers that already read `response`. */
  response: string
  action: 'clarified'
  success: false
  taskType: TaskType
  iterationCount: number
  reActTrace?: ReActTrace
  reasoningSummary?: string
  /** Set when the pre-task confidence gate blocked before Worker execution. */
  preTaskEstimate?: PreTaskEstimate
}

/** Normal completion paths (answer, worker output, errors, verification). */
export interface MWOrchestratorStandardResult {
  type: 'standard'
  /** Text shown to the user (answer, worker output, or error copy). */
  response: string
  action: 'briefed_worker' | 'answered_directly' | 'verification_failed' | 'error'
  success: boolean
  taskType: TaskType
  workerResult?: WorkerResult
  verificationPassed?: boolean
  iterationCount: number
  reActTrace?: ReActTrace
  reasoningSummary?: string
  reflexionSummary?: {
    totalIterations: number
    finalScore: number
    lessonsLearned: string[]
  }
}

/** Outcome of {@link ManagerWorkerOrchestrator.process}. */
export type MWOrchestratorResult =
  | MWOrchestratorClarificationRequired
  | MWOrchestratorStandardResult

export function isMwOrchestratorClarificationRequired(
  r: MWOrchestratorResult,
): r is MWOrchestratorClarificationRequired {
  return r.type === 'clarification_required'
}

/** @deprecated Alias for {@link MAX_REFLEXION_ITERATIONS}; kept for older imports. */
export { MAX_REFLEXION_ITERATIONS as MAX_WORKER_ITERATIONS } from '@/reasoning/reflexionController'

/**
 * End-to-end Manager → Worker → Verifier pipeline for a single user turn.
 */
export default class ManagerWorkerOrchestrator {
  private readonly sessionId: string
  private readonly manager: ManagerAgent
  private readonly worker: WorkerAgent
  private readonly reflexionController: ReflexionController
  private readonly complexityDetector: ComplexityDetector
  private readonly preTaskElicitor = new ConfidenceElicitor()
  /** Set when ReAct `execute_task` hits confidence hard-block; read after {@link ReActLoopController.run}. */
  private _pendingConfidenceClarification?: string
  /** Fresh each turn: experiment variant / registry active / fallback identity (full assembled XML when from registry). */
  private readonly basePromptProvider: () => string

  /**
   * @param sessionId - Active chat session id
   * @param sessionIndex - Session vector index (Manager may use for future retrieval)
   * @param basePromptProvider - Returns the current experiment-aware base system text for Manager/Worker LLM calls
   */
  constructor(sessionId: string, sessionIndex: SessionIndex, basePromptProvider: () => string) {
    this.sessionId = sessionId
    this.basePromptProvider = basePromptProvider
    this.manager = new ManagerAgent(sessionId, sessionIndex)
    this.worker = new WorkerAgent()
    this.reflexionController = new ReflexionController(this.sessionId)
    this.complexityDetector = new ComplexityDetector()
  }

  /**
   * Runs Manager routing, optional Worker execution with verify/retry, and shapes the UI-facing result.
   *
   * @param userMessage - Latest user text
   * @param intentResult - Semantic router output for this turn
   * @param ragContent - Retrieved chunks to treat as artefacts/context
   */
  async process(
    userMessage: string,
    intentResult: RouteResult,
    ragContent: string[],
  ): Promise<MWOrchestratorResult> {
    try {
      const activeBasePrompt = this.basePromptProvider()
      const managerDecision = await this.manager.processTurn(
        userMessage,
        intentResult,
        ragContent,
        activeBasePrompt,
      )
      const taskType = managerDecision.taskState.taskType

      if (managerDecision.action === 'answer_directly') {
        const text = managerDecision.directAnswer ?? 'Got it.'
        return {
          type: 'standard',
          response: text,
          action: 'answered_directly',
          success: true,
          taskType,
          iterationCount: 0,
        }
      }

      if (managerDecision.action === 'clarify') {
        const q = managerDecision.clarificationQuestion ?? 'Could you clarify what you need?'
        return {
          type: 'clarification_required',
          question: q,
          response: q,
          action: 'clarified',
          success: false,
          taskType,
          iterationCount: 0,
        }
      }

      const briefInitial = managerDecision.brief
      if (briefInitial === undefined || briefInitial.trim().length === 0) {
        console.error(`${LOG} brief_worker action without brief`)
        return {
          type: 'standard',
          response: 'Something went wrong...',
          action: 'error',
          success: false,
          taskType,
          iterationCount: 0,
        }
      }

      let effectiveBrief = briefInitial

      // ─── EXECUTION ORDER ──────────────────────────────────────────
      // 1. Pre-task confidence gate (HERE)
      //    Fires before any API spend. shouldProceed=false exits immediately.
      //    Low confidence (<0.60) enriches the brief before continuing.
      //
      // 2. Tree of Thoughts (inside ReActEngine on first step)
      //    Selects best approach from the (possibly enriched) brief.
      //    If pre-task injected a hint, ToT still runs independently —
      //    ToT has more context and its selection takes priority.
      //
      // 3. Worker.execute()
      //    Executes with: enriched brief + ToT-selected approach +
      //    CoT scratchpad context + Reflexion lessons
      //
      // 4. Reflexion critique (post-Worker)
      // 5. Confidence evaluation (post-Worker)
      // ──────────────────────────────────────────────────────────────
      const preTaskEstimate = await this.runPreTaskEstimate(
        effectiveBrief,
        taskType,
        this.sessionId,
      )

      if (!preTaskEstimate.shouldProceed) {
        console.log(
          `${PRE_TASK_LOG} Pre-task gate: BLOCKED (${String(preTaskEstimate.missingInfo.length)} critical gaps)`,
        )
        // ── NAMING NOTE ────────────────────────────────────────────────────
        // Internal shape:  { action: 'clarified', response: '...' }
        // Frontend shape:  { metadata: { type: 'clarification_required' } }
        //
        // The orchestrator uses 'action: clarified' — past tense, describes
        // what the system decided to do (clarify rather than execute).
        //
        // The API layer maps this to metadata.type: 'clarification_required'
        // for the frontend, which is present tense and UI-intent focused.
        //
        // Neither name is wrong — they serve different audiences:
        //   'clarified'              → orchestration logic layer
        //   'clarification_required' → frontend rendering layer
        // ───────────────────────────────────────────────────────────────────
        const q =
          preTaskEstimate.clarifyingQuestions[0] ??
          'Could you provide more detail about the task?'
        return {
          type: 'clarification_required',
          question: q,
          response: q,
          action: 'clarified',
          success: false,
          taskType,
          iterationCount: 0,
          preTaskEstimate,
        }
      }

      if (preTaskEstimate.confidence < 0.6) {
        console.log(
          `${PRE_TASK_LOG} Pre-task confidence low (${String(preTaskEstimate.confidence)}) — proceeding with flag`,
        )
        const missing = preTaskEstimate.missingInfo.slice(0, 2).join(', ')
        const approachHint = preTaskEstimate.suggestedApproach.length > 0 ? ` Suggested approach: ${preTaskEstimate.suggestedApproach}` : ''
        effectiveBrief += `\n\n⚠ Pre-task note: Proceeding with limited information. Missing: ${missing}.${approachHint}`
      }

      if (preTaskEstimate.confidence >= 0.8 && preTaskEstimate.suggestedApproach.length > 0) {
        effectiveBrief += `\n\nPre-task approach hint: ${preTaskEstimate.suggestedApproach}`
      }

      const complexityAssessment = await this.complexityDetector.assess(
        `${userMessage}\n\n${effectiveBrief}`.trim().slice(0, 4000),
        taskType,
      )
      const complexityScore = complexityAssessment.score

      if (FULL_REACT_ROUTES.has(taskType)) {
        return await this._processReActRoute(userMessage, intentResult, ragContent, managerDecision, { effectiveBrief, activeBasePrompt, complexityScore, taskType })
      }
      return await this._processReflexionLoop(effectiveBrief, userMessage, activeBasePrompt, managerDecision, complexityScore, taskType)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      telemetry.record(
        'error',
        this.sessionId,
        { message: msg, context: 'managerWorkerOrchestrator.process' },
        undefined,
        msg,
      )
      console.error(`${LOG} process failed`, err)
      return {
        type: 'standard',
        response: 'Something went wrong...',
        action: 'error',
        success: false,
        taskType: 'unknown',
        iterationCount: 0,
      }
    }
  }

  private async _processReActRoute(
    userMessage: string,
    intentResult: RouteResult,
    ragContent: string[],
    managerDecision: Awaited<ReturnType<ManagerAgent['processTurn']>>,
    config: { effectiveBrief: string; activeBasePrompt: string; complexityScore: number; taskType: TaskType },
  ): Promise<MWOrchestratorResult> {
    const { effectiveBrief, activeBasePrompt, complexityScore, taskType } = config
    this.reflexionController.reset()
    this._pendingConfidenceClarification = undefined

    let reActWorkerBrief = effectiveBrief

    const loopController = new ReActLoopController({
      taskType: intentResult.route,
      sessionId: this.sessionId,
      model: 'gpt-4o',
      complexityScore,
    })

    const loopResult = await loopController.run(
      {
        userMessage,
        taskType: intentResult.route,
        priorSteps: [],
        ragContent,
        taskBrief: effectiveBrief,
        iterationCount: 0,
      },
      async (decision) => {
        if (decision.action === 'execute_task') {
          const phase = await this._executeWithWorker(
            managerDecision,
            {
              brief: reActWorkerBrief,
              userMessage,
              activeBasePrompt,
              complexityScore,
              taskType: managerDecision.taskState.taskType,
            },
            0,
          )
          if (!phase.ok) {
            this._pendingConfidenceClarification = phase.clarificationQuestion
            return {
              actionType: 'execute_task',
              rawOutput: '',
              success: false,
              error: 'confidence_clarification',
            }
          }
          const workerResult = phase.workerResult
          if (!workerResult.success) {
            return {
              actionType: 'execute_task',
              rawOutput: workerResult.content,
              success: false,
              tokensUsed: workerResult.tokensUsed,
              error: workerResult.error,
            }
          }
          const reflexionResult = phase.reflexionResult
          if (reflexionResult === undefined) {
            return {
              actionType: 'execute_task',
              rawOutput: workerResult.content,
              success: true,
              tokensUsed: workerResult.tokensUsed,
            }
          }
          if (reflexionResult.shouldRetry) {
            reActWorkerBrief = reflexionResult.enrichedBrief
            return {
              actionType: 'execute_task',
              rawOutput: reflexionResult.enrichedBrief,
              success: false,
              tokensUsed: workerResult.tokensUsed,
              error: `Reflexion: ${reflexionResult.retryInstruction}`,
            }
          }

          return {
            actionType: 'execute_task',
            rawOutput: workerResult.content,
            success: true,
            tokensUsed: workerResult.tokensUsed,
          }
        }
        return {
          actionType: decision.action,
          rawOutput: '',
          success: true,
        }
      },
    )

    this.manager.ingestReActLoopResult(loopResult)

    if (this._pendingConfidenceClarification !== undefined) {
      const q = this._pendingConfidenceClarification
      this._pendingConfidenceClarification = undefined
      return {
        type: 'clarification_required',
        question: q,
        response: q,
        action: 'clarified',
        success: false,
        taskType,
        iterationCount: loopResult.trace.steps.length,
        reActTrace: loopResult.trace,
        reasoningSummary: loopResult.reasoningSummary,
      }
    }

    if (loopResult.shouldRequestClarification) {
      const q = loopResult.finalDecision.thought.content
      return {
        type: 'clarification_required',
        question: q,
        response: q,
        action: 'clarified',
        success: false,
        taskType,
        iterationCount: loopResult.trace.steps.length,
        reActTrace: loopResult.trace,
        reasoningSummary: loopResult.reasoningSummary,
      }
    }

    let lastExecuteStep: typeof loopResult.trace.steps[number] | undefined
    for (let _i = loopResult.trace.steps.length - 1; _i >= 0; _i--) {
      if (loopResult.trace.steps[_i].action.type === 'execute_task') {
        lastExecuteStep = loopResult.trace.steps[_i]
        break
      }
    }
    const lastWorkerOutput =
      lastExecuteStep?.observation.content ??
      loopResult.finalDecision.finalAnswer ??
      ''

    return {
      type: 'standard',
      response: lastWorkerOutput,
      action: 'briefed_worker',
      success: true,
      taskType,
      iterationCount: loopResult.trace.steps.length,
      reActTrace: loopResult.trace,
      reasoningSummary: loopResult.reasoningSummary,
      verificationPassed: true,
    }
  }

  private async _runReflexionIterations(
    initialBrief: string,
    userMessage: string,
    activeBasePrompt: string,
    managerDecision: Awaited<ReturnType<ManagerAgent['processTurn']>>,
    complexityScore: number,
    taskType: TaskType,
  ): Promise<{
    earlyReturn?: MWOrchestratorClarificationRequired
    bestOutput: string
    bestScore: number
    finalVerificationPassed: boolean
    totalIterations: number
    workerResult: WorkerResult | null
    allOutputs: string[]
  }> {
    let brief = initialBrief
    let bestOutput = ''
    let bestScore = 0
    let finalVerificationPassed = false
    let totalIterations = 0
    let workerResult: WorkerResult | null = null
    const allOutputs: string[] = []

    for (let iteration = 1; iteration <= MAX_REFLEXION_ITERATIONS; iteration++) {
      totalIterations = iteration
      const phase = await this._executeWithWorker(
        managerDecision,
        { brief, userMessage, activeBasePrompt, complexityScore, taskType },
        0,
      )

      if (!phase.ok) {
        const q = phase.clarificationQuestion
        return {
          earlyReturn: { type: 'clarification_required', question: q, response: q, action: 'clarified', success: false, taskType, iterationCount: totalIterations },
          bestOutput, bestScore, finalVerificationPassed, totalIterations, workerResult, allOutputs,
        }
      }

      workerResult = phase.workerResult
      if (!workerResult.success) break

      const reflexionResult = phase.reflexionResult
      if (reflexionResult === undefined) break

      allOutputs.push(workerResult.content)
      this.manager.recordAssistantTurn(workerResult.content)

      if (reflexionResult.critique.overallScore > bestScore) {
        bestScore = reflexionResult.critique.overallScore
        bestOutput = workerResult.content
      }

      if (reflexionResult.critique.passed) {
        finalVerificationPassed = true
        break
      }

      if (!reflexionResult.shouldRetry) break

      brief = reflexionResult.enrichedBrief
      console.log(
        `${LOG} Reflexion retry ${String(iteration + 1)}: ${reflexionResult.retryInstruction.slice(0, 80)}`,
      )
    }

    return { bestOutput, bestScore, finalVerificationPassed, totalIterations, workerResult, allOutputs }
  }

  private async _markEffectiveLessons(): Promise<void> {
    for (const c of this.reflexionController.getIterationHistory()) {
      for (const l of c.lessonsForFuture) {
        const lesson = await lessonsStore.findLessonByExactContent(this.sessionId, l)
        if (lesson !== undefined) {
          await lessonsStore.markEffective(lesson.id, this.sessionId, true)
        }
      }
    }
  }

  private async _processReflexionLoop(
    effectiveBrief: string,
    userMessage: string,
    activeBasePrompt: string,
    managerDecision: Awaited<ReturnType<ManagerAgent['processTurn']>>,
    complexityScore: number,
    taskType: TaskType,
  ): Promise<MWOrchestratorResult> {
    this.reflexionController.reset()
    const iter = await this._runReflexionIterations(effectiveBrief, userMessage, activeBasePrompt, managerDecision, complexityScore, taskType)
    if (iter.earlyReturn !== undefined) return iter.earlyReturn

    const { bestOutput, bestScore, finalVerificationPassed, totalIterations, allOutputs } = iter
    const { workerResult } = iter

    if (bestScore < 0.5 && !finalVerificationPassed) {
      console.warn(
        `${LOG} All iterations failed critique — returning best attempt (score: ${String(bestScore)})`,
      )
    }

    const finalOutput = finalVerificationPassed
      ? (workerResult?.content ?? '')
      : this.reflexionController.getBestOutput(allOutputs) || bestOutput || workerResult?.content || ''

    if (finalVerificationPassed) {
      await this._markEffectiveLessons()
    }

    const reflexionSummary = {
      totalIterations,
      finalScore: bestScore,
      lessonsLearned: this.reflexionController.getIterationHistory().flatMap((c) => c.lessonsForFuture),
    }

    if (!workerResult?.success) {
      return {
        type: 'standard',
        response: 'I encountered an error completing that task. Could you try again?',
        action: 'error',
        success: false,
        taskType,
        workerResult: workerResult ?? undefined,
        verificationPassed: false,
        iterationCount: totalIterations,
        reflexionSummary,
      }
    }

    const mergedWorker: WorkerResult = {
      ...workerResult,
      content: finalOutput,
      iterationCount: totalIterations,
    }

    if (!finalVerificationPassed) {
      console.warn(`${LOG} Max reflexion iterations reached, returning best attempt`)
      return {
        type: 'standard',
        response: finalOutput,
        action: 'verification_failed',
        success: false,
        taskType,
        workerResult: mergedWorker,
        verificationPassed: false,
        iterationCount: totalIterations,
        reflexionSummary,
      }
    }

    return {
      type: 'standard',
      response: finalOutput,
      action: 'briefed_worker',
      success: true,
      taskType,
      workerResult: mergedWorker,
      verificationPassed: true,
      iterationCount: totalIterations,
      reflexionSummary,
    }
  }


  /**
   * Worker → Reflexion → confidence (with {@link WorkerResult.critiqueScore}) → hard-block, tier escalation, or proceed.
   */
  private async _executeWithWorker(
    managerDecision: Awaited<ReturnType<ManagerAgent['processTurn']>>,
    config: {
      brief: string
      userMessage: string
      activeBasePrompt: string
      complexityScore: number
      taskType: TaskType
    },
    iterationCount = 0,
  ): Promise<
    | { ok: false; clarificationQuestion: string }
    | { ok: true; workerResult: WorkerResult; reflexionResult?: ReflexionResult }
  > {
    const escalationPass = iterationCount

    const workerResult = await this.worker.execute(
      config.brief,
      config.taskType,
      'gpt-4o',
      this.sessionId,
      {
        orchestratorBasePrompt: config.activeBasePrompt,
        complexityScore: config.complexityScore,
        skipConfidenceEvaluation: true,
      },
    )

    telemetry.record('worker_executed', this.sessionId, {
      taskType: config.taskType,
      iteration: escalationPass,
      tokensUsed: workerResult.tokensUsed,
      success: workerResult.success,
    })

    if (!workerResult.success) {
      return { ok: true, workerResult }
    }

    const reflexionResult = await this.reflexionController.reflect(config.brief, workerResult.content, {
      originalRequest: config.userMessage,
      taskType: config.taskType,
      output: workerResult.content,
      requirements: managerDecision.taskState.activeRequirements.map((r) => r.description),
      scratchpadSummary: this.manager.getScratchpadSummary() ?? undefined,
    })

    workerResult.critiqueScore = reflexionResult.critique?.overallScore ?? undefined

    const confidenceResult = await confidenceOrchestrator.evaluate(
      workerResult.content,
      {
        sessionId: this.sessionId,
        taskType: config.taskType,
        taskDescription: config.brief.slice(0, 300),
        turnIndex: 0,
        complexityScore: config.complexityScore,
        iterationNumber: escalationPass,
      },
      { critiqueScore: workerResult.critiqueScore },
    )

    if (
      confidenceResult.uarResult?.resolvedContent !== undefined &&
      confidenceResult.uarResult.resolvedContent.length > 0
    ) {
      workerResult.content = confidenceResult.uarResult.resolvedContent
      console.log(
        `${LOG} UAR improved output (confidence: ${confidenceResult.uarResult.originalScore.toFixed(2)} → ${confidenceResult.uarResult.resolvedScore.toFixed(2)})`,
      )
    }

    if (confidenceResult.uncertaintyNotice !== undefined) {
      workerResult.content += `\n\n${confidenceResult.uncertaintyNotice}`
    }

    workerResult.confidenceScore = confidenceResult.score.scalar
    workerResult.confidenceLevel = confidenceResult.score.level

    if (confidenceResult.shouldBlock) {
      console.log(`${PRE_TASK_LOG} Confidence hard-block — returning clarification`)
      return {
        ok: false,
        clarificationQuestion:
          confidenceResult.uarResult?.clarificationQuestion ??
          'Could you provide more detail? I need more context to answer accurately.',
      }
    }

    if (confidenceResult.shouldEscalate && escalationPass < 2) {
      const escalatedComplexity = Math.min((config.complexityScore ?? 0.5) + 0.25, 1)
      console.log(
        `${PRE_TASK_LOG} Confidence escalation — retrying with complexityScore: ${String(escalatedComplexity)}`,
      )
      return await this._executeWithWorker(
        managerDecision,
        { ...config, complexityScore: escalatedComplexity },
        escalationPass + 1,
      )
    }

    if (confidenceResult.shouldEscalate && escalationPass >= 2) {
      console.log(`${PRE_TASK_LOG} Escalation limit reached — using current output`)
    }

    return { ok: true, workerResult, reflexionResult }
  }

  private collectRecentUncertaintyFactors(sessionId: string): string[] {
    const memory = confidenceMemoryStore.getMemory(sessionId)
    if (memory === null || memory.entries.length === 0) return []
    const last3 = memory.entries.slice(-3)
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of last3) {
      for (const f of e.uncertaintyFactors) {
        const t = f.trim()
        if (t.length === 0 || seen.has(t)) continue
        seen.add(t)
        out.push(t)
        if (out.length >= 10) return out
      }
    }
    return out
  }

  private async runPreTaskEstimate(
    taskDescription: string,
    taskType: TaskType,
    sessionId: string,
  ): Promise<PreTaskEstimate> {
    const scratchpadSummary = this.manager.getScratchpadSummary() ?? undefined
    const recentUncertaintyFactors = this.collectRecentUncertaintyFactors(sessionId)
    const relevantLessonRows = await lessonsStore.getRelevantLessons({
      sessionId,
      taskType,
      currentOutput: taskDescription.slice(0, 500),
    })
    const relevantLessons = relevantLessonRows.map((l) => l.lesson)

    const estimate = await this.preTaskElicitor.estimatePreTask(taskDescription, taskType, sessionId, {
      scratchpadSummary,
      recentUncertaintyFactors,
      relevantLessons,
    })

    telemetry.record('pre_task_confidence', sessionId, {
      confidence: estimate.confidence,
      shouldProceed: estimate.shouldProceed,
      missingInfoCount: estimate.missingInfo.length,
      taskType,
    })

    console.log(
      `${PRE_TASK_LOG} Pre-task confidence: ${estimate.confidence.toFixed(2)} shouldProceed: ${String(estimate.shouldProceed)}`,
    )

    return estimate
  }

  /**
   * Lightweight snapshot for debugging or admin panels.
   */
  getStats(): { sessionId: string; currentTaskState: TaskState | null; maxIterations: number } {
    return {
      sessionId: this.sessionId,
      currentTaskState: this.manager.getTaskState(),
      maxIterations: MAX_REFLEXION_ITERATIONS,
    }
  }
}
