import type EventEmitter from 'eventemitter3'

import type { ScreenAgent } from '@/agents/screen-agent'
import {
  EVT_BEHAVIOUR_ACCEPT,
  EVT_BEHAVIOUR_SUGGESTION,
  type BehaviourSuggestionEvent,
} from '@/agents/behaviour/proactive-engine'
import { AgentMode } from '@/agents/screen-agent/types'
import {
  BROWSER_ACT_GOAL_CONTINUE,
  shouldDelegateJarvisBrowserActToRenderer,
  type JarvisBrowserActIpcPayload,
} from '@/browser/screen-browser-act'

/** Emitted by dialogue / NLU when an intent is resolved (Jarvis-v4 contract). */
export interface IntentResolvedPayload {
  intent: string
  slots?: Record<string, string | undefined>
  utterance?: string
}

const INTENT_WATCH = 'jarvis.screen.watch'
const INTENT_ADVISE = 'jarvis.screen.advise'
const INTENT_ACT = 'jarvis.screen.act'
const INTENT_QUERY = 'jarvis.screen.query'
const INTENT_STOP = 'jarvis.screen.stop'

const ROUTABLE_SCREEN_INTENTS = new Set<string>([
  INTENT_WATCH,
  INTENT_ADVISE,
  INTENT_ACT,
  INTENT_QUERY,
  INTENT_STOP,
])

/** v1 ACT goal when the active app looks like a browser (matches in-app Jarvis browser ACT). */
export const BEHAVIOUR_ACT_GOAL_BROWSER = BROWSER_ACT_GOAL_CONTINUE

/** v1 ACT goal when the active app is not detected as a browser. */
export const BEHAVIOUR_ACT_GOAL_DEFAULT = 'Take the next helpful step based on what is on screen.'

/** v1 default screen query when accepting a proactive `jarvis.screen.query` suggestion. */
export const BEHAVIOUR_QUERY_DEFAULT = 'What do you see on my screen right now?'

/** Voice / UI → orchestrator: forward to ScreenAgent approval flow. */
const EVT_USER_CONFIRMED = 'jarvis:user:confirmed'
const EVT_USER_CANCELLED = 'jarvis:user:cancelled'

export type ScreenAgentHandlerOptions = {
  /**
   * When set, in-app browser ACT goals are delegated to the renderer (IPC) so
   * `JarvisBrowser` session APIs run where the shell is mounted.
   */
  delegateBrowserAct?: (payload: JarvisBrowserActIpcPayload) => void
}

function isBehaviourSuggestionEvent(x: unknown): x is BehaviourSuggestionEvent {
  if (x === null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  const ctx = o.context
  if (ctx === null || typeof ctx !== 'object') {
    return false
  }
  const c = ctx as Record<string, unknown>
  const tod = c.timeOfDay
  return (
    o.type === 'behaviour:suggestion' &&
    typeof o.sessionId === 'string' &&
    typeof o.suggestedIntent === 'string' &&
    typeof o.confidence === 'number' &&
    Array.isArray(o.reasons) &&
    typeof c.dayOfWeek === 'number' &&
    (tod === 'morning' || tod === 'afternoon' || tod === 'evening' || tod === 'night') &&
    Array.isArray(c.recentIntents) &&
    typeof o.createdAt === 'number'
  )
}

function isBrowserLikeApp(app: string | null | undefined): boolean {
  if (app === null || app === undefined || app === '') {
    return false
  }
  const a = app.toLowerCase()
  if (/\b(chrome|firefox|edge|safari|opera|brave|vivaldi|msedge|chromium)\b/.test(a)) {
    return true
  }
  if (a.includes('google chrome') || a.includes('mozilla firefox') || a.includes('microsoft edge')) {
    return true
  }
  return false
}

function intentSuggestionLabel(intent: string): string {
  switch (intent) {
    case INTENT_WATCH:
      return 'switch to screen watch mode'
    case INTENT_ADVISE:
      return 'switch to advise mode so I can comment on your screen'
    case INTENT_STOP:
      return 'stop the current screen task'
    case INTENT_ACT:
      return 'start an action on your screen'
    case INTENT_QUERY:
      return 'ask what is on your screen'
    default:
      return `run ${intent}`
  }
}

function formatSuggestionSpeech(s: BehaviourSuggestionEvent): string {
  const label = intentSuggestionLabel(s.suggestedIntent)
  const conf = Math.round(s.confidence * 100)
  const hint = s.reasons[0] ? ` ${s.reasons[0]}.` : ''
  return `Suggestion: ${label}. About ${conf} percent confidence.${hint} Say yes if you want me to do that.`
}

/**
 * Maps a stored behaviour suggestion to the same {@link IntentResolvedPayload} shape
 * as NLU / voice (`routeIntent`). Returns null if the suggested intent is not routable.
 */
export function intentResolvedFromBehaviourSuggestion(
  s: BehaviourSuggestionEvent,
): IntentResolvedPayload | null {
  const intent = s.suggestedIntent
  if (!ROUTABLE_SCREEN_INTENTS.has(intent)) {
    return null
  }

  switch (intent) {
    case INTENT_WATCH:
    case INTENT_ADVISE:
    case INTENT_STOP:
      return { intent }
    case INTENT_ACT: {
      const app = s.context.activeApp ?? null
      const goal = isBrowserLikeApp(app) ? BEHAVIOUR_ACT_GOAL_BROWSER : BEHAVIOUR_ACT_GOAL_DEFAULT
      return { intent, slots: { goal }, utterance: goal }
    }
    case INTENT_QUERY:
      return {
        intent,
        slots: { question: BEHAVIOUR_QUERY_DEFAULT },
        utterance: BEHAVIOUR_QUERY_DEFAULT,
      }
    default:
      return null
  }
}

/**
 * Bridges global orchestrator events ↔ {@link ScreenAgent} (modes, queries, approvals).
 * Does not import voice/dialogue modules — listens on the shared emitter only.
 *
 * Proactive browser ACT: `jarvis:behaviour:suggestion` → user accept (`EVT_BEHAVIOUR_ACCEPT`) →
 * `intent:resolved` with `jarvis.screen.act` + `slots.goal`; when `delegateBrowserAct` is set,
 * matching in-app browser goals are IPC’d to the renderer instead of `setMode(ACT)`.
 */
export class ScreenAgentHandler {
  private lastBehaviourSuggestion: BehaviourSuggestionEvent | null = null

  private readonly onIntentResolved = (payload: unknown): void => {
    void this.routeIntent(payload)
  }

  private readonly onGlobalUserConfirmed = (): void => {
    this.screenAgent.emit('user:confirmed')
  }

  private readonly onGlobalUserCancelled = (): void => {
    this.screenAgent.emit('user:cancelled')
  }

  private readonly onJarvisSpeakForward = (p: {
    text: string
    priority: 'low' | 'normal' | 'high'
  }): void => {
    this.globalEmitter.emit('jarvis:speak', p)
  }

  private readonly onBehaviourSuggestion = (payload: unknown): void => {
    if (!isBehaviourSuggestionEvent(payload)) {
      console.warn('[ScreenAgentHandler] invalid jarvis:behaviour:suggestion payload')
      return
    }
    this.lastBehaviourSuggestion = payload
    this.globalEmitter.emit('jarvis:speak', {
      text: formatSuggestionSpeech(payload),
      priority: 'normal',
    })
  }

  private readonly onBehaviourAccept = (): void => {
    const s = this.lastBehaviourSuggestion
    if (s === null) {
      return
    }
    const resolved = intentResolvedFromBehaviourSuggestion(s)
    this.lastBehaviourSuggestion = null
    if (resolved === null) {
      console.warn('[ScreenAgentHandler] cannot route suggested intent:', s.suggestedIntent)
      return
    }
    this.globalEmitter.emit('intent:resolved', resolved)
  }

  constructor(
    private readonly screenAgent: ScreenAgent,
    private readonly globalEmitter: EventEmitter,
    private readonly options: ScreenAgentHandlerOptions = {},
  ) {}

  init(): void {
    this.globalEmitter.on('intent:resolved', this.onIntentResolved as (p: unknown) => void)
    this.globalEmitter.on(EVT_USER_CONFIRMED, this.onGlobalUserConfirmed)
    this.globalEmitter.on(EVT_USER_CANCELLED, this.onGlobalUserCancelled)
    this.globalEmitter.on(EVT_BEHAVIOUR_SUGGESTION, this.onBehaviourSuggestion)
    this.globalEmitter.on(EVT_BEHAVIOUR_ACCEPT, this.onBehaviourAccept)
    this.screenAgent.on('jarvis:speak', this.onJarvisSpeakForward)
  }

  destroy(): void {
    this.globalEmitter.off('intent:resolved', this.onIntentResolved as (p: unknown) => void)
    this.globalEmitter.off(EVT_USER_CONFIRMED, this.onGlobalUserConfirmed)
    this.globalEmitter.off(EVT_USER_CANCELLED, this.onGlobalUserCancelled)
    this.globalEmitter.off(EVT_BEHAVIOUR_SUGGESTION, this.onBehaviourSuggestion)
    this.globalEmitter.off(EVT_BEHAVIOUR_ACCEPT, this.onBehaviourAccept)
    this.screenAgent.off('jarvis:speak', this.onJarvisSpeakForward)
    this.lastBehaviourSuggestion = null
  }

  private async routeIntent(raw: unknown): Promise<void> {
    const p = raw as Partial<IntentResolvedPayload>
    const intent = typeof p.intent === 'string' ? p.intent : ''
    const slots = p.slots ?? {}

    switch (intent) {
      case INTENT_WATCH:
        await this.screenAgent.setMode(AgentMode.WATCH)
        return
      case INTENT_ADVISE:
        await this.screenAgent.setMode(AgentMode.ADVISE)
        return
      case INTENT_ACT: {
        const goal = typeof slots.goal === 'string' ? slots.goal.trim() : ''
        if (goal.length === 0) {
          console.warn('[ScreenAgentHandler] jarvis.screen.act requires slots.goal')
          return
        }
        const delegate = this.options.delegateBrowserAct
        if (delegate !== undefined && shouldDelegateJarvisBrowserActToRenderer(goal)) {
          delegate({
            goal,
            slots: slots as Record<string, string | undefined>,
          })
          return
        }
        await this.screenAgent.setMode(AgentMode.ACT, goal)
        return
      }
      case INTENT_QUERY: {
        const q = typeof slots.question === 'string' ? slots.question : p.utterance ?? ''
        if (q.trim().length === 0) {
          console.warn('[ScreenAgentHandler] jarvis.screen.query requires slots.question')
          return
        }
        await this.screenAgent.queryScreen(q)
        return
      }
      case INTENT_STOP:
        this.screenAgent.stop()
        return
      default:
        return
    }
  }
}
