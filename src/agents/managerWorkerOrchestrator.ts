/**
 * Coordinates {@link ManagerAgent}, {@link WorkerAgent}, and {@link VerifierAgent} for the Jarvis Manager–Worker flow.
 */

import ManagerAgent from './managerAgent'
import WorkerAgent, { type WorkerResult } from './workerAgent'
import VerifierAgent, { VERIFICATION_THRESHOLD } from './verifierAgent'
import type { TaskState, TaskType } from './taskState'
import type { RouteResult } from '@/lib/router/semanticRouter'
import SessionIndex from '@/memory/sessionIndex'
import { telemetry } from '@/lib/observability/telemetryCollector'

const LOG = '[MWOrchestrator]'

/**
 * Outcome of {@link ManagerWorkerOrchestrator.process}.
 */
export interface MWOrchestratorResult {
  /** Text shown to the user (answer, clarification, worker output, or error copy). */
  response: string
  action: 'briefed_worker' | 'clarified' | 'answered_directly' | 'verification_failed' | 'error'
  taskType: TaskType
  workerResult?: WorkerResult
  verificationPassed?: boolean
  /** Worker loop iterations executed (0 when the Worker was not run). */
  iterationCount: number
}

/** Max Worker attempts when verification or quick-check fails. */
export const MAX_WORKER_ITERATIONS = 3

/**
 * End-to-end Manager → Worker → Verifier pipeline for a single user turn.
 */
export default class ManagerWorkerOrchestrator {
  private readonly sessionId: string
  private readonly manager: ManagerAgent
  private readonly worker: WorkerAgent
  private readonly verifier: VerifierAgent
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
    this.verifier = new VerifierAgent()
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
        return {
          response: managerDecision.directAnswer ?? 'Got it.',
          action: 'answered_directly',
          taskType,
          iterationCount: 0,
        }
      }

      if (managerDecision.action === 'clarify') {
        return {
          response: managerDecision.clarificationQuestion ?? 'Could you clarify what you need?',
          action: 'clarified',
          taskType,
          iterationCount: 0,
        }
      }

      const briefInitial = managerDecision.brief
      if (briefInitial === undefined || briefInitial.trim().length === 0) {
        console.error(`${LOG} brief_worker action without brief`)
        return {
          response: 'Something went wrong...',
          action: 'error',
          taskType,
          iterationCount: 0,
        }
      }

      const { workerResult, verificationPassed, iteration } = await this._executeWorkerLoop(
        taskType,
        briefInitial,
        activeBasePrompt,
      )

      if (workerResult === null || !workerResult.success) {
        return {
          response: 'I encountered an error completing that task. Could you try again?',
          action: 'error',
          taskType,
          workerResult: workerResult ?? undefined,
          verificationPassed: false,
          iterationCount: iteration,
        }
      }

      if (!verificationPassed) {
        console.warn(`${LOG} Max iterations reached, returning best attempt`)
        return {
          response: workerResult.content,
          action: 'verification_failed',
          taskType,
          workerResult,
          verificationPassed: false,
          iterationCount: iteration,
        }
      }

      return {
        response: workerResult.content,
        action: 'briefed_worker',
        taskType,
        workerResult,
        verificationPassed: true,
        iterationCount: iteration,
      }
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
        response: 'Something went wrong...',
        action: 'error',
        taskType: 'unknown',
        iterationCount: 0,
      }
    }
  }

  /**
   * Worker execute → quick check → full verify, with bounded retries and growing brief.
   */
  private async _executeWorkerLoop(
    taskType: TaskType,
    briefInitial: string,
    orchestratorBasePrompt: string,
  ): Promise<{ workerResult: WorkerResult | null; verificationPassed: boolean; iteration: number }> {
    let brief = briefInitial
    let workerResult: WorkerResult | null = null
    let verificationPassed = false
    let iteration = 0

    while (iteration < MAX_WORKER_ITERATIONS) {
      iteration++
      workerResult = await this.worker.execute(brief, taskType, 'gpt-4o', orchestratorBasePrompt)
      telemetry.record('worker_executed', this.sessionId, {
        taskType,
        iteration,
        tokensUsed: workerResult.tokensUsed,
        success: workerResult.success,
      })

      if (!workerResult.success) {
        break
      }

      this.manager.recordAssistantTurn(workerResult.content)

      const quickPass = await this.verifier.quickCheck(workerResult.content, taskType)
      if (!quickPass) {
        console.warn(`${LOG} Quick check failed on iteration ${String(iteration)}`)
        brief = this._buildRetryBrief(brief, workerResult.content, 'Output failed basic quality checks')
        continue
      }

      const verification = await this.verifier.verify(brief, workerResult.content, taskType)
      telemetry.record('worker_verified', this.sessionId, {
        taskType,
        passed: verification.passed,
        score: verification.score,
        iteration,
        unsatisfiedCount: verification.unsatisfiedRequirements.length,
      })
      if (verification.passed) {
        verificationPassed = true
        break
      }

      if (iteration < MAX_WORKER_ITERATIONS) {
        const hint = verification.suggestion ?? verification.issues.join('; ')
        console.warn(
          `${LOG} Verification failed (score: ${String(verification.score)}; threshold ${String(VERIFICATION_THRESHOLD)}), retrying...`,
        )
        brief = this._buildRetryBrief(brief, workerResult.content, hint.length > 0 ? hint : 'Verification did not pass')
      }
    }

    return { workerResult, verificationPassed, iteration }
  }

  /**
   * Appends retry instructions and the prior attempt snippet to the **current** brief (may already include retries).
   */
  private _buildRetryBrief(currentBrief: string, failedOutput: string, issue: string): string {
    return `${currentBrief}

<retry_context>
The previous attempt produced this output:
<previous_attempt>${failedOutput.slice(0, 1000)}</previous_attempt>

It failed because: ${issue}

Please fix these issues in your next response.
</retry_context>
`
  }

  /**
   * Lightweight snapshot for debugging or admin panels.
   */
  getStats(): { sessionId: string; currentTaskState: TaskState | null; maxIterations: number } {
    return {
      sessionId: this.sessionId,
      currentTaskState: this.manager.getTaskState(),
      maxIterations: MAX_WORKER_ITERATIONS,
    }
  }
}
