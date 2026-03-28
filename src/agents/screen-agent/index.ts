import { BaseAgent } from '../base-agent'

import { DEFAULT_CONFIG } from './config'
import type { AgentMode, ScreenAgentConfig, ScreenState } from './types'

/**
 * Isolated screen-observation agent: WebSocket bridge to Python, significance, advice, goals.
 * Emits typed `ScreenAgentEvents` only — never imports audio/TTS/STT pipelines.
 */
export class ScreenAgent extends BaseAgent {
  readonly id = 'jarvis-screen-agent'

  private readonly config: ScreenAgentConfig

  constructor(config: Partial<ScreenAgentConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async initialize(): Promise<void> {
    /* stub */
  }

  async setMode(_mode: AgentMode, _goal?: string): Promise<void> {
    /* stub */
  }

  stop(): void {
    /* stub */
  }

  async queryScreen(_question: string): Promise<string> {
    return ''
  }

  async getMemoryAt(_timestamp: number): Promise<ScreenState | null> {
    return null
  }

  getCurrentState(): ScreenState | null {
    return null
  }

  getMode(): AgentMode {
    return this.config.mode
  }
}

export * from './types'
export { DEFAULT_CONFIG, DENYLIST, APPROVAL_REQUIRED_PATTERNS, VOICE_PROTECTED_PATTERNS } from './config'
export { PythonBridge } from './python-bridge'
export type { ConnectionStatus } from './python-bridge'
export { StateManager } from './state-manager'
export { SignificanceDetector } from './significance-detector'
export { AdviceGenerator } from './advice-generator'
export { SafetyGate } from './safety-gate'
export { GoalExecutor } from './goal-executor'
