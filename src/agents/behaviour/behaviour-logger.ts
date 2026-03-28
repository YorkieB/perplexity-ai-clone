import type EventEmitter from 'eventemitter3'
import { v4 as uuidv4 } from 'uuid'

import type { ScreenState } from '@/agents/screen-agent/types'

import type { BehaviourEvent, SessionSummary } from './types'
import { BehaviourEventType } from './types'
import type { SpacesClient } from './spaces-client'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseIntentPayload(raw: unknown): {
  intent: string
  rawText: string | null
  entities: Record<string, unknown>
} {
  if (raw === null || typeof raw !== 'object') {
    return { intent: '', rawText: null, entities: {} }
  }
  const p = raw as Record<string, unknown>
  const intent = typeof p.intent === 'string' ? p.intent : ''
  const rawText =
    typeof p.rawText === 'string'
      ? p.rawText
      : typeof p.utterance === 'string'
        ? p.utterance
        : null
  let entities: Record<string, unknown> = {}
  if (p.entities !== null && typeof p.entities === 'object' && !Array.isArray(p.entities)) {
    entities = p.entities as Record<string, unknown>
  } else if (p.slots !== null && typeof p.slots === 'object' && !Array.isArray(p.slots)) {
    entities = p.slots as Record<string, unknown>
  }
  return { intent, rawText, entities }
}

/**
 * Records session behaviour to a buffer and periodically flushes JSONL to Spaces.
 * Never throws from event handlers.
 */
export class BehaviourLogger {
  private readonly sessionId: string
  private readonly sessionStart: number
  private lastEventTime: number
  private buffer: BehaviourEvent[] = []
  private readonly allEvents: BehaviourEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly emitter: EventEmitter,
    private readonly spacesClient: SpacesClient,
  ) {
    this.sessionId = uuidv4()
    this.sessionStart = Date.now()
    this.lastEventTime = Date.now()
  }

  init(): void {
    this.record({
      eventType: BehaviourEventType.SESSION_START,
      app: '',
      intent: null,
      rawText: null,
      agentMode: null,
      outcome: null,
      metadata: {},
    })

    this.emitter.on('intent:resolved', (raw: unknown) => {
      try {
        const { intent, rawText, entities } = parseIntentPayload(raw)
        this.record({
          eventType: BehaviourEventType.INTENT_RESOLVED,
          app: '',
          intent: intent || null,
          rawText,
          agentMode: null,
          outcome: null,
          metadata: { entities },
        })
      } catch {
        /* never break Jarvis */
      }
    })

    this.emitter.on('jarvis:speak', (p: unknown) => {
      try {
        const o = p as { text?: string; priority?: string }
        this.record({
          eventType: BehaviourEventType.ADVICE_GIVEN,
          app: '',
          intent: null,
          rawText: typeof o.text === 'string' ? o.text : null,
          agentMode: null,
          outcome: null,
          metadata: {
            text: typeof o.text === 'string' ? o.text : '',
            priority: o.priority,
          },
        })
      } catch {
        /* noop */
      }
    })

    this.emitter.on('screen:change', (ev: unknown) => {
      try {
        const state = ev as Partial<ScreenState> & { significance?: number }
        const app =
          typeof state.windowTitle === 'string' && state.windowTitle.length > 0
            ? state.windowTitle
            : typeof state.activeApp === 'string'
              ? state.activeApp
              : ''
        const meta: Record<string, unknown> = {}
        if (typeof state.significance === 'number') {
          meta.significance = state.significance
        }
        this.record({
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app,
          intent: null,
          rawText: null,
          agentMode: null,
          outcome: null,
          metadata: meta,
        })
      } catch {
        /* noop */
      }
    })

    this.emitter.on('screen:mode_changed', (p: unknown) => {
      try {
        let mode: string | null = null
        if (typeof p === 'string') {
          mode = p
        } else if (p !== null && typeof p === 'object') {
          const o = p as Record<string, unknown>
          if (typeof o.newMode === 'string') {
            mode = o.newMode
          } else if (typeof o.mode === 'string') {
            mode = o.mode
          }
        }
        this.record({
          eventType: BehaviourEventType.MODE_CHANGED,
          app: '',
          intent: null,
          rawText: null,
          agentMode: mode,
          outcome: null,
          metadata: {},
        })
      } catch {
        /* noop */
      }
    })

    this.emitter.on('goal:started', (p: unknown) => {
      try {
        let goal = ''
        if (p !== null && typeof p === 'object' && typeof (p as { goal?: string }).goal === 'string') {
          goal = (p as { goal: string }).goal
        }
        this.record({
          eventType: BehaviourEventType.GOAL_STARTED,
          app: '',
          intent: 'jarvis.screen.act',
          rawText: null,
          agentMode: null,
          outcome: 'pending',
          metadata: { goal },
        })
      } catch {
        /* noop */
      }
    })

    this.emitter.on('goal:completed', (p: unknown) => {
      try {
        let stepsCompleted = 0
        if (p !== null && typeof p === 'object' && 'stepsCompleted' in p) {
          const s = (p as { stepsCompleted?: unknown }).stepsCompleted
          if (typeof s === 'number' && !Number.isNaN(s)) {
            stepsCompleted = s
          }
        }
        this.record({
          eventType: BehaviourEventType.GOAL_COMPLETED,
          app: '',
          intent: null,
          rawText: null,
          agentMode: null,
          outcome: 'success',
          metadata: { stepsCompleted },
        })
      } catch {
        /* noop */
      }
    })

    this.emitter.on('goal:failed', (p: unknown) => {
      try {
        let reason = ''
        if (p !== null && typeof p === 'object' && typeof (p as { reason?: string }).reason === 'string') {
          reason = (p as { reason: string }).reason
        }
        this.record({
          eventType: BehaviourEventType.GOAL_FAILED,
          app: '',
          intent: null,
          rawText: null,
          agentMode: null,
          outcome: 'failure',
          metadata: { reason },
        })
      } catch {
        /* noop */
      }
    })

    this.flushTimer = setInterval(() => {
      void this.flush()
    }, 60_000)
  }

  record(partial: Partial<BehaviourEvent>): void {
    const now = Date.now()
    const d = new Date(now)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const durationMs = now - this.lastEventTime
    this.lastEventTime = now

    const eventType = partial.eventType ?? BehaviourEventType.ERROR

    const event: BehaviourEvent = {
      sessionId: this.sessionId,
      timestamp: now,
      timeOfDay: `${hh}:${mm}`,
      dayOfWeek: d.getDay(),
      app: typeof partial.app === 'string' ? partial.app : '',
      eventType,
      intent: partial.intent ?? null,
      rawText: partial.rawText ?? null,
      agentMode: partial.agentMode ?? null,
      durationMs,
      outcome: partial.outcome ?? null,
      metadata: partial.metadata !== undefined ? partial.metadata : {},
    }

    this.buffer.push(event)
    this.allEvents.push(event)
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return
    }
    const events = [...this.buffer]
    this.buffer = []
    const key = `behaviour/${todayKey()}/${this.sessionId}.jsonl`
    const lines = events.map((e) => JSON.stringify(e)).join('\n')
    try {
      await this.spacesClient.append(key, lines)
      console.debug(`Flushed ${String(events.length)} behaviour events to Spaces`)
    } catch {
      /* SpacesClient should not throw; swallow if a test mock rejects */
    }
  }

  private computeSummary(): SessionSummary {
    const intentsResolved: string[] = []
    const seenIntent = new Set<string>()
    const modes = new Set<string>()
    let goalsCompleted = 0
    let goalsFailed = 0
    const appCounts = new Map<string, number>()

    for (const e of this.allEvents) {
      if (e.eventType === BehaviourEventType.INTENT_RESOLVED && e.intent) {
        if (!seenIntent.has(e.intent)) {
          seenIntent.add(e.intent)
          intentsResolved.push(e.intent)
        }
      }
      if (e.eventType === BehaviourEventType.MODE_CHANGED && e.agentMode) {
        modes.add(e.agentMode)
      }
      if (e.eventType === BehaviourEventType.GOAL_COMPLETED) {
        goalsCompleted += 1
      }
      if (e.eventType === BehaviourEventType.GOAL_FAILED) {
        goalsFailed += 1
      }
      if (e.app.length > 0) {
        appCounts.set(e.app, (appCounts.get(e.app) ?? 0) + 1)
      }
    }

    let mostActiveApp: string | null = null
    let best = 0
    for (const [app, n] of appCounts) {
      if (n > best) {
        best = n
        mostActiveApp = app
      }
    }

    const durationMinutes = (Date.now() - this.sessionStart) / 60_000

    return {
      totalEvents: this.allEvents.length,
      intentsResolved,
      modesUsed: [...modes],
      goalsCompleted,
      goalsFailed,
      mostActiveApp,
      durationMinutes,
    }
  }

  async endSession(): Promise<void> {
    this.record({
      eventType: BehaviourEventType.SESSION_END,
      app: '',
      intent: null,
      rawText: null,
      agentMode: null,
      outcome: null,
      metadata: {},
    })

    const summary = this.computeSummary()
    const day = todayKey()
    await this.spacesClient.upload(
      `behaviour/sessions/${day}/${this.sessionId}-summary.json`,
      JSON.stringify(summary, null, 2),
    )
    await this.flush()

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  getSessionId(): string {
    return this.sessionId
  }

  /**
   * Stops the 60s flush timer without emitting {@link BehaviourEventType.SESSION_END}.
   * Use in tests or when tearing down without a full {@link endSession}.
   */
  cancelPeriodicFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }
}
