import { v4 as uuidv4 } from 'uuid'

import { SpacesClient } from './spaces-client'
import {
  type BehaviourEvent,
  BehaviourEventType,
  type BehaviourSession,
  type SessionSummary,
} from './types'

/** Minimal bus surface: Node `EventEmitter`, `eventemitter3`, or any compatible implementation. */
export interface BehaviourBus {
  on(event: string, listener: (...args: unknown[]) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
}

/**
 * Records orchestrator events to a buffer, flushes JSONL to Spaces, and uploads a session summary on end.
 */
export class BehaviourLogger {
  private readonly emitter: BehaviourBus
  private readonly spaces: SpacesClient
  private readonly sessionId: string
  private readonly sessionStart: number
  private lastEventTime: number
  private buffer: BehaviourEvent[]
  /** Full session history (survives periodic {@link flush}). */
  private readonly allSessionEvents: BehaviourEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null
  private closed: boolean
  private listenersAttached = false

  constructor(emitter: BehaviourBus, spaces: SpacesClient) {
    this.emitter = emitter
    this.spaces = spaces
    this.sessionId = uuidv4()
    this.sessionStart = Date.now()
    this.lastEventTime = this.sessionStart
    this.buffer = []
    this.flushTimer = null
    this.closed = false
  }

  init(): void {
    if (this.listenersAttached) {
      return
    }

    this.record({
      eventType: BehaviourEventType.SESSION_START,
      app: null,
      intent: null,
      rawText: null,
      agentMode: null,
      outcome: null,
      metadata: {},
    })

    this.emitter.on('intent:resolved', this.onIntentResolved)
    this.emitter.on('jarvis:speak', this.onJarvisSpeak)
    this.emitter.on('screen:change', this.onScreenChange)
    this.emitter.on('screen:mode_changed', this.onScreenModeChanged)
    this.emitter.on('goal:started', this.onGoalStarted)
    this.emitter.on('goal:completed', this.onGoalCompleted)
    this.emitter.on('goal:failed', this.onGoalFailed)

    this.listenersAttached = true

    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {})
    }, 60_000)
  }

  private detachListeners(): void {
    if (!this.listenersAttached) {
      return
    }
    this.emitter.off('intent:resolved', this.onIntentResolved)
    this.emitter.off('jarvis:speak', this.onJarvisSpeak)
    this.emitter.off('screen:change', this.onScreenChange)
    this.emitter.off('screen:mode_changed', this.onScreenModeChanged)
    this.emitter.off('goal:started', this.onGoalStarted)
    this.emitter.off('goal:completed', this.onGoalCompleted)
    this.emitter.off('goal:failed', this.onGoalFailed)
    this.listenersAttached = false
  }

  private readonly onIntentResolved = (payload: unknown): void => {
    const p = payload as {
      intent?: string
      rawText?: string
      utterance?: string
      entities?: Record<string, unknown>
    }
    this.record({
      eventType: BehaviourEventType.INTENT_RESOLVED,
      intent: p?.intent ?? null,
      rawText: p?.rawText ?? p?.utterance ?? null,
      agentMode: null,
      app: null,
      outcome: null,
      metadata: { entities: p?.entities ?? {} },
    })
  }

  private readonly onJarvisSpeak = (payload: unknown): void => {
    const p = payload as { text?: string; priority?: string }
    this.record({
      eventType: BehaviourEventType.ADVICE_GIVEN,
      intent: null,
      rawText: null,
      agentMode: null,
      app: null,
      outcome: null,
      metadata: {
        text: p?.text ?? '',
        priority: p?.priority ?? 'normal',
      },
    })
  }

  private readonly onScreenChange = (event: unknown): void => {
    const ev = event as {
      windowTitle?: string | null
      activeApp?: string | null
      context?: { windowTitle?: string | null }
      significance?: number | null
    }
    const fromTitle = ev?.windowTitle || ev?.context?.windowTitle || null
    const fromActive =
      typeof ev?.activeApp === 'string' && ev.activeApp.length > 0 ? ev.activeApp : null
    const app = fromTitle || fromActive
    this.record({
      eventType: BehaviourEventType.SCREEN_CHANGE,
      app: typeof app === 'string' && app.length > 0 ? app : null,
      intent: null,
      rawText: null,
      agentMode: null,
      outcome: null,
      metadata: { significance: ev?.significance ?? null },
    })
  }

  private readonly onScreenModeChanged = (mode: unknown): void => {
    let agentMode: string | null = null
    if (typeof mode === 'string') {
      agentMode = mode
    } else if (mode !== null && typeof mode === 'object') {
      const o = mode as { newMode?: string; mode?: string }
      if (typeof o.newMode === 'string') {
        agentMode = o.newMode
      } else if (typeof o.mode === 'string') {
        agentMode = o.mode
      }
    }
    this.record({
      eventType: BehaviourEventType.MODE_CHANGED,
      app: null,
      intent: null,
      rawText: null,
      agentMode,
      outcome: null,
      metadata: {},
    })
  }

  private readonly onGoalStarted = (payload: unknown): void => {
    const p = payload as { goal?: string }
    this.record({
      eventType: BehaviourEventType.GOAL_STARTED,
      app: null,
      intent: 'jarvis.screen.act',
      rawText: null,
      agentMode: 'ACT',
      outcome: 'pending',
      metadata: { goal: p?.goal ?? null },
    })
  }

  private readonly onGoalCompleted = (payload: unknown): void => {
    const p = payload as { stepsCompleted?: number }
    this.record({
      eventType: BehaviourEventType.GOAL_COMPLETED,
      app: null,
      intent: 'jarvis.screen.act',
      rawText: null,
      agentMode: 'ACT',
      outcome: 'success',
      metadata: { stepsCompleted: p?.stepsCompleted ?? null },
    })
  }

  private readonly onGoalFailed = (payload: unknown): void => {
    const p = payload as { reason?: string; failureReason?: string; stepsCompleted?: number }
    const reason = p?.reason ?? p?.failureReason ?? null
    this.record({
      eventType: BehaviourEventType.GOAL_FAILED,
      app: null,
      intent: 'jarvis.screen.act',
      rawText: null,
      agentMode: 'ACT',
      outcome: 'failure',
      metadata: {
        reason,
        stepsCompleted: p?.stepsCompleted ?? null,
      },
    })
  }

  private buildEvent(partial: Partial<BehaviourEvent>): BehaviourEvent {
    const now = Date.now()
    const duration = now - this.lastEventTime

    const d = new Date(now)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')

    const event: BehaviourEvent = {
      sessionId: this.sessionId,
      timestamp: now,
      timeOfDay: `${hh}:${mm}`,
      dayOfWeek: d.getDay(),
      app: partial.app ?? null,
      eventType: partial.eventType!,
      intent: partial.intent ?? null,
      rawText: partial.rawText ?? null,
      agentMode: partial.agentMode ?? null,
      durationMs: partial.durationMs ?? duration,
      outcome: partial.outcome ?? null,
      metadata: partial.metadata ?? {},
    }

    this.lastEventTime = now
    return event
  }

  record(partial: Partial<BehaviourEvent>): void {
    if (this.closed) {
      return
    }
    if (!partial.eventType) {
      return
    }
    const evt = this.buildEvent(partial)
    this.buffer.push(evt)
    this.allSessionEvents.push(evt)
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) {
      return
    }
    const events = [...this.buffer]
    this.buffer = []

    const day = new Date(this.sessionStart)
    const yyyy = day.getFullYear()
    const mm = String(day.getMonth() + 1).padStart(2, '0')
    const dd = String(day.getDate()).padStart(2, '0')

    const key = `behaviour/${yyyy}-${mm}-${dd}/${this.sessionId}.jsonl`
    const lines = events.map((e) => JSON.stringify(e)).join('\n')

    await this.spaces.append(key, lines)
  }

  async endSession(): Promise<void> {
    if (this.closed) {
      return
    }

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    this.detachListeners()

    this.record({
      eventType: BehaviourEventType.SESSION_END,
      app: null,
      intent: null,
      rawText: null,
      agentMode: null,
      outcome: null,
      metadata: {},
    })

    this.closed = true

    const endTime = Date.now()
    const allEvents = [...this.allSessionEvents]

    const summary: SessionSummary = {
      totalEvents: allEvents.length,
      intentsResolved: Array.from(
        new Set(
          allEvents
            .filter((e) => e.eventType === BehaviourEventType.INTENT_RESOLVED && e.intent)
            .map((e) => e.intent as string),
        ),
      ),
      modesUsed: Array.from(
        new Set(allEvents.filter((e) => e.agentMode).map((e) => e.agentMode as string)),
      ),
      goalsCompleted: allEvents.filter((e) => e.eventType === BehaviourEventType.GOAL_COMPLETED)
        .length,
      goalsFailed: allEvents.filter((e) => e.eventType === BehaviourEventType.GOAL_FAILED).length,
      mostActiveApp: null,
      durationMinutes: (endTime - this.sessionStart) / 60_000,
    }

    if (allEvents.length) {
      const counts = new Map<string, number>()
      for (const e of allEvents) {
        if (!e.app) {
          continue
        }
        counts.set(e.app, (counts.get(e.app) ?? 0) + 1)
      }
      let topApp: string | null = null
      let topCount = 0
      for (const [app, count] of counts.entries()) {
        if (count > topCount) {
          topCount = count
          topApp = app
        }
      }
      summary.mostActiveApp = topApp
    }

    const session: BehaviourSession = {
      sessionId: this.sessionId,
      startTime: this.sessionStart,
      endTime,
      events: allEvents,
      summary,
    }

    const day = new Date(this.sessionStart)
    const yyyy = day.getFullYear()
    const mm = String(day.getMonth() + 1).padStart(2, '0')
    const dd = String(day.getDate()).padStart(2, '0')

    const summaryKey = `behaviour/sessions/${yyyy}-${mm}-${dd}/${this.sessionId}-summary.json`

    await this.spaces.upload(summaryKey, JSON.stringify(session, null, 2))
    await this.flush()
  }

  getSessionId(): string {
    return this.sessionId
  }
}
