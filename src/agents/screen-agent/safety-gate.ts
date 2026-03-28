import type { AgentAction } from './types'

export class SafetyGate {
  private readonly log: Array<{ timestamp: number; action: AgentAction; approved: boolean; executed: boolean }> = []

  isBlocked(_action: AgentAction): boolean {
    return false
  }

  requiresApproval(_action: AgentAction): boolean {
    return false
  }

  logAction(action: AgentAction, approved: boolean, executed: boolean): void {
    this.log.push({ timestamp: Date.now(), action, approved, executed })
  }

  getActionLog(): Array<{ timestamp: number; action: AgentAction; approved: boolean; executed: boolean }> {
    return [...this.log]
  }
}
