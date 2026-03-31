import {
  type IntentPredictor,
  type PredictContext,
  type PredictResult,
  hourToTimeOfDay,
} from './intent-predictor'

/**
 * Same contract as Node.js `events`.EventEmitter (`on` / `off` / `emit`);
 * satisfied by `eventemitter3` and Node {@link import('events').EventEmitter}.
 */
export interface ProactiveEngineBus {
  on(event: string, listener: (...args: unknown[]) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): boolean
}

/** Emitted on the shared bus when a proactive suggestion is ready. */
export const EVT_BEHAVIOUR_SUGGESTION = 'jarvis:behaviour:suggestion' as const

/** Voice/UI: user accepted the last spoken behaviour suggestion — handler emits `intent:resolved`. */
export const EVT_BEHAVIOUR_ACCEPT = 'jarvis:behaviour:accept' as const

/**
 * Orchestrator and tests use `intent:resolved` / `screen:change` (not `jarvis:*` prefixes).
 */
export const EVT_INTENT_RESOLVED = 'intent:resolved' as const
export const EVT_SCREEN_CHANGE = 'screen:change' as const

export type BehaviourSuggestionEvent = {
  type: 'behaviour:suggestion'
  sessionId: string
  suggestedIntent: string
  confidence: number
  reasons: string[]
  context: {
    recentIntents: string[]
    activeApp?: string | null
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
    dayOfWeek: number
  }
  createdAt: number
}

export interface ProactiveEngineConfig {
  maxRecentIntents: number
  confidenceThreshold: number
  intervalMs: number
  debounceMs: number
  cooldownMs: number
}

export class ProactiveEngine {
  private readonly predictor: IntentPredictor
  private readonly emitter: ProactiveEngineBus
  private readonly config: ProactiveEngineConfig

  private readonly sessionId: string
  private recentIntents: string[] = []
  private activeApp: string | null = null

  private intervalId: ReturnType<typeof setInterval> | null = null
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null
  private lastSuggestionAt = 0
  private started = false

  private readonly onIntentResolvedBound: (payload: unknown) => void
  private readonly onScreenChangeBound: (payload: unknown) => void

  constructor(
    predictor: IntentPredictor,
    emitter: ProactiveEngineBus,
    config: ProactiveEngineConfig,
    sessionId: string,
  ) {
    this.predictor = predictor
    this.emitter = emitter
    this.config = config
    this.sessionId = sessionId

    this.onIntentResolvedBound = this.onIntentResolved.bind(this)
    this.onScreenChangeBound = this.onScreenChange.bind(this)
  }

  /**
   * Start listening to events and scheduling predictions.
   */
  start(): void {
    if (this.started) {
      return
    }
    this.started = true

    this.emitter.on(EVT_INTENT_RESOLVED, this.onIntentResolvedBound)
    this.emitter.on(EVT_SCREEN_CHANGE, this.onScreenChangeBound)

    this.intervalId = setInterval(() => {
      this.maybePredict('timer')
    }, this.config.intervalMs)
  }

  /**
   * Stop all timers and event listeners.
   */
  stop(): void {
    if (!this.started) {
      return
    }
    this.started = false

    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.debounceTimeout !== null) {
      clearTimeout(this.debounceTimeout)
      this.debounceTimeout = null
    }

    this.emitter.off(EVT_INTENT_RESOLVED, this.onIntentResolvedBound)
    this.emitter.off(EVT_SCREEN_CHANGE, this.onScreenChangeBound)

    this.recentIntents = []
    this.activeApp = null
  }

  private onIntentResolved(payload: unknown): void {
    const p = payload as { intent?: string; app?: string | null }
    const intent = p.intent
    if (typeof intent !== 'string' || intent.length === 0) {
      return
    }
    if (p.app !== undefined && p.app !== null && p.app !== '') {
      this.activeApp = p.app
    }

    this.recentIntents.push(intent)
    if (this.recentIntents.length > this.config.maxRecentIntents) {
      this.recentIntents.splice(0, this.recentIntents.length - this.config.maxRecentIntents)
    }

    if (this.debounceTimeout !== null) {
      clearTimeout(this.debounceTimeout)
    }
    this.debounceTimeout = setTimeout(() => {
      this.maybePredict('intent')
    }, this.config.debounceMs)
  }

  /** Handles {@link ScreenState}-like payloads from `screen:change`. */
  private onScreenChange(event: unknown): void {
    const e = event as { activeApp?: string | null; windowTitle?: string | null; app?: string | null }
    if (e.app !== undefined) {
      this.activeApp = e.app ?? null
      return
    }
    const titleOrApp = e.activeApp ?? e.windowTitle ?? null
    if (typeof titleOrApp === 'string' && titleOrApp.length > 0) {
      this.activeApp = titleOrApp
    } else {
      this.activeApp = null
    }
  }

  private getTimeOfDay(now = new Date()): PredictContext['timeOfDay'] {
    return hourToTimeOfDay(now.getHours())
  }

  private getDayOfWeek(now = new Date()): number {
    return now.getDay()
  }

  /**
   * Internal helper that decides whether to call predictor and emit suggestion.
   */
  private maybePredict(_source: 'timer' | 'intent'): void {
    if (!this.started) {
      return
    }
    if (this.recentIntents.length === 0) {
      return
    }

    const now = Date.now()
    if (now - this.lastSuggestionAt < this.config.cooldownMs) {
      return
    }

    const context: PredictContext = {
      recentIntents: this.recentIntents.slice(),
      activeApp: this.activeApp,
      timeOfDay: this.getTimeOfDay(new Date(now)),
      dayOfWeek: this.getDayOfWeek(new Date(now)),
    }

    const result: PredictResult = this.predictor.predict(context)

    if (!result.predictedIntent || result.confidence < this.config.confidenceThreshold) {
      return
    }

    this.lastSuggestionAt = now

    const suggestion: BehaviourSuggestionEvent = {
      type: 'behaviour:suggestion',
      sessionId: this.sessionId,
      suggestedIntent: result.predictedIntent,
      confidence: result.confidence,
      reasons: result.reasons,
      context,
      createdAt: now,
    }

    this.emitter.emit(EVT_BEHAVIOUR_SUGGESTION, suggestion)
  }
}
