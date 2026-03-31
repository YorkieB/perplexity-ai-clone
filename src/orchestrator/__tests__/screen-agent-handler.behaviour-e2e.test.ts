import EventEmitter from 'eventemitter3'

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import {
  EVT_BEHAVIOUR_ACCEPT,
  EVT_BEHAVIOUR_SUGGESTION,
  type BehaviourSuggestionEvent,
} from '@/agents/behaviour/proactive-engine'

import {
  BEHAVIOUR_ACT_GOAL_BROWSER,
  type IntentResolvedPayload,
  ScreenAgentHandler,
} from '../screen-agent-handler'

type JarvisSpeakPayload = { text: string; priority: 'low' | 'normal' | 'high' }

function minimalSuggestion(overrides: {
  suggestedIntent: string
  confidence?: number
  reasons?: string[]
  activeApp?: string | null
  recentIntents?: string[]
}): BehaviourSuggestionEvent {
  const {
    suggestedIntent,
    confidence = 0.8,
    reasons = ['You often start screen watch now.'],
    activeApp = null,
    recentIntents = ['jarvis.screen.watch'],
  } = overrides
  return {
    type: 'behaviour:suggestion',
    sessionId: 'e2e-session',
    suggestedIntent,
    confidence,
    reasons,
    context: {
      recentIntents,
      activeApp,
      timeOfDay: 'morning',
      dayOfWeek: 1,
    },
    createdAt: Date.now(),
  }
}

describe('ScreenAgentHandler behaviour suggestion pipeline (bus-level)', () => {
  let globalEmitter: EventEmitter
  let setMode: jest.Mock
  let queryScreen: jest.Mock
  let stop: jest.Mock
  let on: jest.Mock
  let off: jest.Mock
  let emit: jest.Mock
  let speakPayloads: JarvisSpeakPayload[]
  let intentResolvedPayloads: IntentResolvedPayload[]

  beforeEach(() => {
    globalEmitter = new EventEmitter()
    setMode = jest.fn(async () => {})
    queryScreen = jest.fn(async () => 'answer')
    stop = jest.fn()
    on = jest.fn()
    off = jest.fn()
    emit = jest.fn()
    speakPayloads = []
    intentResolvedPayloads = []

    globalEmitter.on('jarvis:speak', (p: unknown) => {
      speakPayloads.push(p as JarvisSpeakPayload)
    })
    globalEmitter.on('intent:resolved', (p: unknown) => {
      intentResolvedPayloads.push(p as IntentResolvedPayload)
    })

    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function makeHandler(): ScreenAgentHandler {
    const screenAgent = {
      setMode,
      queryScreen,
      stop,
      on,
      off,
      emit,
    }
    return new ScreenAgentHandler(screenAgent as never, globalEmitter)
  }

  it('behaviour suggestion → speak prompt for watch', () => {
    const h = makeHandler()
    h.init()

    const suggestion = minimalSuggestion({
      suggestedIntent: 'jarvis.screen.watch',
      confidence: 0.8,
      reasons: ['You often start screen watch now.'],
    })

    globalEmitter.emit(EVT_BEHAVIOUR_SUGGESTION, suggestion)

    expect(speakPayloads).toHaveLength(1)
    const text = speakPayloads[0]!.text
    expect(text).toContain('watch')
    expect(text).toMatch(/80 percent confidence/i)
    expect(text).toContain('You often start screen watch now.')
    expect(text).toContain('Say yes if you want me to do that.')

    h.destroy()
  })

  it('accept watch suggestion → intent:resolved watch', async () => {
    const h = makeHandler()
    h.init()

    globalEmitter.emit(
      EVT_BEHAVIOUR_SUGGESTION,
      minimalSuggestion({ suggestedIntent: 'jarvis.screen.watch' }),
    )
    expect(speakPayloads.length).toBeGreaterThanOrEqual(1)

    globalEmitter.emit(EVT_BEHAVIOUR_ACCEPT)

    expect(intentResolvedPayloads).toHaveLength(1)
    const resolved = intentResolvedPayloads[0]!
    expect(resolved.intent).toBe('jarvis.screen.watch')
    expect(resolved.slots).toBeUndefined()
    expect(resolved.utterance).toBeUndefined()

    await Promise.resolve()

    h.destroy()
  })

  it('accept ACT browser suggestion → intent:resolved ACT with browser goal and utterance', async () => {
    const h = makeHandler()
    h.init()

    globalEmitter.emit(
      EVT_BEHAVIOUR_SUGGESTION,
      minimalSuggestion({
        suggestedIntent: 'jarvis.screen.act',
        confidence: 0.91,
        reasons: ['Browser is focused.'],
        activeApp: 'Google Chrome',
        recentIntents: ['jarvis.screen.watch', 'jarvis.screen.query'],
      }),
    )

    globalEmitter.emit(EVT_BEHAVIOUR_ACCEPT)

    expect(intentResolvedPayloads).toHaveLength(1)
    const resolved = intentResolvedPayloads[0]!
    expect(resolved).toEqual({
      intent: 'jarvis.screen.act',
      slots: { goal: BEHAVIOUR_ACT_GOAL_BROWSER },
      utterance: BEHAVIOUR_ACT_GOAL_BROWSER,
    } satisfies IntentResolvedPayload)

    await Promise.resolve()

    h.destroy()
  })

  it('accept with no pending suggestion does nothing', () => {
    const h = makeHandler()
    h.init()

    globalEmitter.emit(EVT_BEHAVIOUR_ACCEPT)

    expect(intentResolvedPayloads).toHaveLength(0)

    h.destroy()
  })
})
