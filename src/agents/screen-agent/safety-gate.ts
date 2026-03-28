import { APPROVAL_REQUIRED_PATTERNS, DENYLIST } from './config'
import type { AgentAction } from './types'

const MAX_LOG = 500

function actionToSearchString(action: AgentAction): string {
  return JSON.stringify(action).toLowerCase()
}

/**
 * Blocks unsafe actions and records approval decisions for ACT mode.
 */
export class SafetyGate {
  private actionLog: Array<{
    timestamp: number
    action: AgentAction
    approved: boolean
    executed: boolean
  }> = []

  isBlocked(action: AgentAction): boolean {
    const s = actionToSearchString(action)
    for (const pattern of DENYLIST) {
      const p = pattern.toLowerCase()
      if (s.includes(p)) {
        console.warn('[SafetyGate] blocked action — matched deny pattern:', pattern)
        return true
      }
    }
    return false
  }

  requiresApproval(action: AgentAction): boolean {
    if (action.needsApproval) {
      return true
    }
    const s = actionToSearchString(action)
    for (const pattern of APPROVAL_REQUIRED_PATTERNS) {
      if (s.includes(pattern.toLowerCase())) {
        return true
      }
    }
    return false
  }

  logAction(action: AgentAction, approved: boolean, executed: boolean): void {
    this.actionLog.push({ timestamp: Date.now(), action, approved, executed })
    if (this.actionLog.length > MAX_LOG) {
      this.actionLog.splice(0, this.actionLog.length - MAX_LOG)
    }
    console.info(
      `[SafetyGate] Action [${action.type}] approved=${String(approved)} executed=${String(executed)}`,
    )
  }

  getActionLog(): Array<{
    timestamp: number
    action: AgentAction
    approved: boolean
    executed: boolean
  }> {
    return [...this.actionLog]
  }
}
