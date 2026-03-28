import EventEmitter from 'eventemitter3'

import type { AgentAction, GoalResult, ScreenAgentEvents } from './types'
import type { PythonBridge } from './python-bridge'

export class GoalExecutor {
  isRunning = false
  currentGoal: string | null = null

  constructor(
    private readonly _bridge: PythonBridge,
    private readonly _emitter: EventEmitter<ScreenAgentEvents>,
  ) {}

  async execute(goal: string): Promise<GoalResult> {
    this.currentGoal = goal
    return {
      success: false,
      goal,
      stepsCompleted: 0,
      failureReason: 'skeleton',
    }
  }

  stop(): void {
    this.isRunning = false
    this.currentGoal = null
  }

  private async handleApprovalRequired(_action: AgentAction): Promise<boolean> {
    return false
  }
}
