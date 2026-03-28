import EventEmitter from 'eventemitter3'

import { MAX_GOAL_DURATION_MS } from './config'
import type { SafetyGate } from './safety-gate'
import type { AgentAction, GoalResult, ScreenAgentEvents } from './types'
import type { PythonBridge } from './python-bridge'

function parseAgentAction(raw: unknown): AgentAction {
  if (raw !== null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    return {
      type: typeof o.type === 'string' ? o.type : 'unknown',
      targetId: typeof o.targetId === 'string' ? o.targetId : undefined,
      text: typeof o.text === 'string' ? o.text : undefined,
      keys: Array.isArray(o.keys) ? (o.keys as string[]) : undefined,
      reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
      needsApproval: Boolean(o.needsApproval),
    }
  }
  return { type: 'unknown', reasoning: '', needsApproval: true }
}

const APPROVAL_WAIT_MS = 15_000

/**
 * Runs ACT-mode goals over the Python bridge with safety and approval flows.
 */
export class GoalExecutor {
  private isRunning = false
  currentGoal: string | null = null
  private goalTimeout: ReturnType<typeof setTimeout> | null = null
  private stepsCompleted = 0
  private pendingApprovalFinish: ((approved: boolean) => void) | null = null
  private goalResolve: ((r: GoalResult) => void) | null = null

  private goalProgressHandler: ((p: Record<string, unknown>) => void) | null = null
  private goalCompleteHandler: ((p: Record<string, unknown>) => void) | null = null
  private goalFailedHandler: ((p: Record<string, unknown>) => void) | null = null
  private approvalRequiredHandler: ((p: Record<string, unknown>) => void) | null = null

  constructor(
    private readonly bridge: PythonBridge,
    private readonly emitter: EventEmitter<ScreenAgentEvents>,
    private readonly safety: SafetyGate,
  ) {}

  /** Voice / UI: user said confirm or cancel while an approval is pending. */
  notifyUserApproval(approved: boolean): void {
    if (this.pendingApprovalFinish !== null) {
      this.pendingApprovalFinish(approved)
      this.pendingApprovalFinish = null
    }
  }

  hasPendingApproval(): boolean {
    return this.pendingApprovalFinish !== null
  }

  /** True while an ACT goal promise is in flight (used for stop announcements). */
  isGoalExecutionActive(): boolean {
    return this.isRunning && this.goalResolve !== null
  }

  async execute(goal: string): Promise<GoalResult> {
    if (this.isRunning) {
      return {
        success: false,
        goal,
        stepsCompleted: 0,
        failureReason: 'Another goal is already running',
      }
    }

    this.isRunning = true
    this.currentGoal = goal
    this.stepsCompleted = 0

    this.emitter.emit('jarvis:speak', {
      text: `On it. Starting: ${goal}`,
      priority: 'normal',
    })

    this.bridge.send({ command: 'set_mode', mode: 'ACT', goal })

    return await new Promise<GoalResult>((resolve) => {
      this.goalResolve = resolve

      const finish = (r: GoalResult): void => {
        const res = this.goalResolve
        if (res === null) {
          return
        }
        this.goalResolve = null
        this.clearGoalTimeout()
        this.detachGoalListeners()
        this.isRunning = false
        this.currentGoal = null
        res(r)
      }

      this.goalProgressHandler = (payload: Record<string, unknown>) => {
        const sc =
          typeof payload.steps === 'number'
            ? payload.steps
            : typeof payload.steps_completed === 'number'
              ? payload.steps_completed
              : typeof payload.stepsCompleted === 'number'
                ? payload.stepsCompleted
                : undefined
        if (typeof sc === 'number') {
          this.stepsCompleted = sc
        }
        console.info('[GoalExecutor] goal_progress', { stepsCompleted: this.stepsCompleted })
      }

      this.goalCompleteHandler = (payload: Record<string, unknown>) => {
        const steps =
          typeof payload.stepsCompleted === 'number'
            ? payload.stepsCompleted
            : typeof payload.steps_completed === 'number'
              ? payload.steps_completed
              : this.stepsCompleted
        finish({ success: true, goal, stepsCompleted: steps })
      }

      this.goalFailedHandler = (payload: Record<string, unknown>) => {
        const steps =
          typeof payload.stepsCompleted === 'number'
            ? payload.stepsCompleted
            : typeof payload.steps_completed === 'number'
              ? payload.steps_completed
              : this.stepsCompleted
        const reason =
          typeof payload.failureReason === 'string'
            ? payload.failureReason
            : typeof payload.reason === 'string'
              ? payload.reason
              : 'Goal failed'
        finish({ success: false, goal, stepsCompleted: steps, failureReason: reason })
      }

      this.approvalRequiredHandler = (payload: Record<string, unknown>) => {
        const action = parseAgentAction(payload.action)
        void this.handleApprovalRequired(action).catch((e: unknown) => {
          console.error('[GoalExecutor] handleApprovalRequired failed', e)
        })
      }

      this.bridge.on('goal_progress', this.goalProgressHandler)
      this.bridge.on('goal_complete', this.goalCompleteHandler)
      this.bridge.on('goal_failed', this.goalFailedHandler)
      this.bridge.on('approval_required', this.approvalRequiredHandler)

      this.goalTimeout = setTimeout(() => {
        this.bridge.send({ command: 'stop' })
        finish({
          success: false,
          goal,
          stepsCompleted: this.stepsCompleted,
          failureReason: 'Goal timed out after 5 minutes',
        })
      }, MAX_GOAL_DURATION_MS)
    })
  }

  stop(): void {
    if (!this.isRunning || this.goalResolve === null) {
      return
    }
    this.bridge.send({ command: 'stop' })
    const resolve = this.goalResolve
    const steps = this.stepsCompleted
    const g = this.currentGoal ?? ''
    this.goalResolve = null
    this.clearGoalTimeout()
    this.detachGoalListeners()
    this.isRunning = false
    this.currentGoal = null
    resolve({
      success: false,
      goal: g,
      stepsCompleted: steps,
      failureReason: 'Stopped by user',
    })
  }

  private detachGoalListeners(): void {
    if (this.goalProgressHandler !== null) {
      this.bridge.off('goal_progress', this.goalProgressHandler)
      this.goalProgressHandler = null
    }
    if (this.goalCompleteHandler !== null) {
      this.bridge.off('goal_complete', this.goalCompleteHandler)
      this.goalCompleteHandler = null
    }
    if (this.goalFailedHandler !== null) {
      this.bridge.off('goal_failed', this.goalFailedHandler)
      this.goalFailedHandler = null
    }
    if (this.approvalRequiredHandler !== null) {
      this.bridge.off('approval_required', this.approvalRequiredHandler)
      this.approvalRequiredHandler = null
    }
  }

  private clearGoalTimeout(): void {
    if (this.goalTimeout !== null) {
      clearTimeout(this.goalTimeout)
      this.goalTimeout = null
    }
  }

  private async handleApprovalRequired(action: AgentAction): Promise<boolean> {
    if (this.safety.isBlocked(action)) {
      this.safety.logAction(action, false, false)
      this.bridge.send({ type: 'approval_response', approved: false })
      return false
    }

    if (!this.safety.requiresApproval(action) && !action.needsApproval) {
      this.bridge.send({ type: 'approval_response', approved: true })
      this.safety.logAction(action, true, true)
      return true
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        this.pendingApprovalFinish = null
        this.bridge.send({ type: 'approval_response', approved: false })
        this.safety.logAction(action, false, false)
        resolve(false)
      }, APPROVAL_WAIT_MS)

      const finish = (approved: boolean): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        this.pendingApprovalFinish = null
        this.bridge.send({ type: 'approval_response', approved })
        this.safety.logAction(action, approved, approved)
        resolve(approved)
      }

      this.pendingApprovalFinish = finish

      this.emitter.emit('screen:approval_required', {
        action,
        description: action.reasoning,
        resolve: (approved: boolean) => {
          finish(approved)
        },
      })
    })
  }
}
