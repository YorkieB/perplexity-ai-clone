import EventEmitter from 'eventemitter3'

import { BaseAgent } from '../base-agent'

import { AdviceGenerator, type JarvisAdviceLlm } from './advice-generator'
import { DEFAULT_CONFIG } from './config'
import { PythonBridge } from './python-bridge'
import { SignificanceDetector } from './significance-detector'
import { StateManager, type JarvisMemoryClient } from './state-manager'
import { AgentMode, type ScreenAgentConfig, type ScreenAgentEvents, type ScreenState } from './types'

function normalizeTimestamp(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return Date.now()
  }
  if (raw < 1e12) {
    return Math.round(raw * 1000)
  }
  return raw
}

function isScreenStateLike(r: object): r is ScreenState {
  return (
    'frameId' in r &&
    'timestamp' in r &&
    'elements' in r &&
    typeof (r as ScreenState).frameId === 'string'
  )
}

export interface ScreenAgentDeps {
  memoryClient?: JarvisMemoryClient | null
  bridge?: PythonBridge
  llmClient?: JarvisAdviceLlm
  adviceGenerator?: AdviceGenerator
  significanceDetector?: SignificanceDetector
}

/**
 * Isolated screen-observation agent: WebSocket bridge to Python, significance, advice, goals.
 * Emits typed `ScreenAgentEvents` only — never imports audio capture or playback pipelines.
 */
export class ScreenAgent extends BaseAgent {
  readonly id = 'jarvis-screen-agent'

  private readonly config: ScreenAgentConfig
  private readonly bridge: PythonBridge
  private readonly stateManager: StateManager
  private readonly emitter = new EventEmitter<ScreenAgentEvents>()
  private mode: AgentMode
  private currentState: ScreenState | null = null
  private prevState: ScreenState | null = null
  private readonly significanceDetector: SignificanceDetector
  private readonly adviceGenerator: AdviceGenerator

  private readonly onBridgeConnected = (): void => {
    console.info('Screen agent connected')
  }

  private readonly onBridgeDisconnected = (): void => {
    console.info('Screen agent disconnected')
  }

  private readonly handleScreenChange = async (raw: Record<string, unknown>): Promise<void> => {
    const frameId = raw.frame_id
    const state: ScreenState = {
      frameId:
        typeof frameId === 'number' || typeof frameId === 'string' ? String(frameId) : '0',
      timestamp: normalizeTimestamp(raw.timestamp),
      activeApp: typeof raw.app === 'string' ? raw.app : null,
      windowTitle: typeof raw.window === 'string' ? raw.window : null,
      fullText: '',
      errorDetected: Boolean(raw.error_detected),
      url: null,
      elements: [],
      resolution: { width: 0, height: 0 },
    }
    await this.stateManager.store(state)
    this.currentState = state
    this.emit('screen:change', state)
    if (state.errorDetected) {
      const app = state.activeApp ?? 'unknown'
      this.emit('screen:error', { state, errorText: `Error detected in ${app}` })
    }
    console.debug('[ScreenAgent] screen_change', {
      frame_id: raw.frame_id,
      app: raw.app,
      error_detected: raw.error_detected,
    })

    if (this.mode === AgentMode.ADVISE) {
      const significance = this.significanceDetector.detect(state, this.prevState)
      if (significance.shouldSpeak) {
        const advice = await this.adviceGenerator.generate(state, significance.reason)
        if (advice) {
          this.emit('jarvis:speak', {
            text: advice,
            priority: significance.score >= 0.85 ? 'high' : 'normal',
          })
          this.emit('screen:advice_ready', { advice })
          console.info(
            `Advice emitted — reason: ${significance.reason}, score: ${String(significance.score)}`,
          )
        }
      }
    }

    this.prevState = state
  }

  constructor(config: Partial<ScreenAgentConfig> = {}, deps: ScreenAgentDeps = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.mode = AgentMode.WATCH
    this.bridge = deps.bridge ?? new PythonBridge(this.config.wsPort)
    this.stateManager = new StateManager(deps.memoryClient)
    this.significanceDetector = deps.significanceDetector ?? new SignificanceDetector()
    this.adviceGenerator = deps.adviceGenerator ?? new AdviceGenerator(deps.llmClient)
  }

  emit<K extends keyof ScreenAgentEvents>(event: K, ...args: ScreenAgentEvents[K]): boolean {
    return (this.emitter.emit as (e: K, ...a: ScreenAgentEvents[K]) => boolean)(event, ...args)
  }

  on<K extends keyof ScreenAgentEvents>(
    event: K,
    fn: (...args: ScreenAgentEvents[K]) => void,
    context?: unknown
  ): this {
    this.emitter.on(event, fn as never, context)
    return this
  }

  once<K extends keyof ScreenAgentEvents>(
    event: K,
    fn: (...args: ScreenAgentEvents[K]) => void,
    context?: unknown
  ): this {
    this.emitter.once(event, fn as never, context)
    return this
  }

  off<K extends keyof ScreenAgentEvents>(
    event: K,
    fn?: (...args: ScreenAgentEvents[K]) => void,
    context?: unknown,
    once?: boolean
  ): this {
    this.emitter.off(event, fn as never, context, once)
    return this
  }

  async initialize(): Promise<void> {
    this.bridge.on('screen_change', this.handleScreenChange)
    this.bridge.on('connected', this.onBridgeConnected)
    this.bridge.on('disconnected', this.onBridgeDisconnected)
    await this.bridge.connect()
    console.info('Screen agent initialized in WATCH mode')
  }

  async setMode(mode: AgentMode, goal?: string): Promise<void> {
    const previous = this.mode
    if (previous !== mode) {
      if (mode === AgentMode.ADVISE) {
        console.info('Entering ADVISE mode — Jarvis will speak proactively')
      }
      if (previous === AgentMode.ADVISE) {
        console.info('Leaving ADVISE mode')
      }
      this.prevState = null
    }
    this.mode = mode
    this.bridge.send({ command: 'set_mode', mode, goal })
    console.info('[ScreenAgent] mode', mode, goal ?? '')
  }

  stop(): void {
    this.bridge.off('screen_change', this.handleScreenChange)
    this.bridge.off('connected', this.onBridgeConnected)
    this.bridge.off('disconnected', this.onBridgeDisconnected)
    this.bridge.disconnect()
    console.info('Screen agent stopped')
  }

  async queryScreen(question: string): Promise<string> {
    if (this.bridge.getStatus() !== 'connected') {
      return 'Screen agent not connected'
    }
    return await new Promise<string>((resolve, reject) => {
      const to = setTimeout(() => {
        this.bridge.off('query_response', onResp)
        reject(new Error('queryScreen: timeout waiting for query_response'))
      }, 10_000)
      const onResp = (payload: { answer: string }): void => {
        clearTimeout(to)
        this.bridge.off('query_response', onResp)
        resolve(payload.answer)
      }
      this.bridge.on('query_response', onResp)
      this.bridge.send({ command: 'query_screen', question })
    })
  }

  async getMemoryAt(timestamp: number): Promise<ScreenState | null> {
    const local = await this.stateManager.getStateAt(timestamp)
    if (local !== null) {
      return local
    }
    if (this.bridge.getStatus() !== 'connected') {
      return null
    }
    return await new Promise<ScreenState | null>((resolve) => {
      const to = setTimeout(() => {
        this.bridge.off('memory_response', onMem)
        resolve(null)
      }, 5000)
      const onMem = (payload: { record: unknown }): void => {
        clearTimeout(to)
        this.bridge.off('memory_response', onMem)
        const r = payload.record
        if (r !== null && typeof r === 'object' && isScreenStateLike(r)) {
          resolve(r)
        } else {
          resolve(null)
        }
      }
      this.bridge.on('memory_response', onMem)
      this.bridge.send({ command: 'query_memory', timestamp })
    })
  }

  getCurrentState(): ScreenState | null {
    return this.currentState
  }

  getMode(): AgentMode {
    return this.mode
  }
}

export * from './types'
export { DEFAULT_CONFIG, DENYLIST, APPROVAL_REQUIRED_PATTERNS, VOICE_PROTECTED_PATTERNS } from './config'
export { PythonBridge } from './python-bridge'
export type { ConnectionStatus } from './python-bridge'
export { StateManager, type JarvisMemoryClient } from './state-manager'
export { SignificanceDetector } from './significance-detector'
export { AdviceGenerator, type JarvisAdviceLlm } from './advice-generator'
export { SafetyGate } from './safety-gate'
export { GoalExecutor } from './goal-executor'
