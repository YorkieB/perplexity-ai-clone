import EventEmitter from 'eventemitter3'

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import {
  EVT_BEHAVIOUR_ACCEPT,
  EVT_BEHAVIOUR_SUGGESTION,
  type BehaviourSuggestionEvent,
} from '@/agents/behaviour/proactive-engine'
import { AgentMode } from '@/agents/screen-agent/types'
import { BROWSER_ACT_GOAL_CONTINUE, BROWSER_ACT_GOAL_OPEN_URL } from '@/browser/screen-browser-act'

import {
  BEHAVIOUR_ACT_GOAL_BROWSER,
  BEHAVIOUR_ACT_GOAL_DEFAULT,
  intentResolvedFromBehaviourSuggestion,
  ScreenAgentHandler,
} from '../screen-agent-handler'

describe('ScreenAgentHandler', () => {
  let globalEmitter: EventEmitter
  let setMode: jest.Mock
  let queryScreen: jest.Mock
  let stop: jest.Mock
  let on: jest.Mock
  let off: jest.Mock
  let emit: jest.Mock

  beforeEach(() => {
    globalEmitter = new EventEmitter()
    setMode = jest.fn(async () => {})
    queryScreen = jest.fn(async () => 'answer')
    stop = jest.fn()
    on = jest.fn()
    off = jest.fn()
    emit = jest.fn()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function makeHandler(opts?: {
    delegateBrowserAct?: (p: { goal: string; slots: Record<string, string | undefined> }) => void
  }): ScreenAgentHandler {
    const screenAgent = {
      setMode,
      queryScreen,
      stop,
      on,
      off,
      emit,
    }
    return new ScreenAgentHandler(screenAgent as never, globalEmitter, {
      delegateBrowserAct: opts?.delegateBrowserAct,
    })
  }

  it('routes jarvis.screen.watch → setMode(WATCH)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.watch' })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.WATCH)
    h.destroy()
  })

  it('routes jarvis.screen.advise → setMode(ADVISE)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.advise' })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.ADVISE)
    h.destroy()
  })

  it('routes jarvis.screen.act with goal → setMode(ACT, goal)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.act',
      slots: { goal: 'open notepad' },
    })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.ACT, 'open notepad')
    h.destroy()
  })

  it('delegates browser continue ACT to renderer and skips setMode', async () => {
    const delegate = jest.fn()
    const h = makeHandler({ delegateBrowserAct: delegate })
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.act',
      slots: { goal: BROWSER_ACT_GOAL_CONTINUE },
    })
    await Promise.resolve()
    expect(delegate).toHaveBeenCalledWith({
      goal: BROWSER_ACT_GOAL_CONTINUE,
      slots: { goal: BROWSER_ACT_GOAL_CONTINUE },
    })
    expect(setMode).not.toHaveBeenCalled()
    h.destroy()
  })

  it('delegates open-url browser ACT to renderer and skips setMode', async () => {
    const delegate = jest.fn()
    const h = makeHandler({ delegateBrowserAct: delegate })
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.act',
      slots: { goal: `${BROWSER_ACT_GOAL_OPEN_URL} https://example.com`, url: 'https://example.com' },
    })
    await Promise.resolve()
    expect(delegate).toHaveBeenCalledWith({
      goal: `${BROWSER_ACT_GOAL_OPEN_URL} https://example.com`,
      slots: { goal: `${BROWSER_ACT_GOAL_OPEN_URL} https://example.com`, url: 'https://example.com' },
    })
    expect(setMode).not.toHaveBeenCalled()
    h.destroy()
  })

  it('routes jarvis.screen.query → queryScreen', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.query',
      slots: { question: 'what app is focused?' },
    })
    await Promise.resolve()
    expect(queryScreen).toHaveBeenCalledWith('what app is focused?')
    h.destroy()
  })

  it('routes jarvis.screen.stop → stop()', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.stop' })
    await Promise.resolve()
    expect(stop).toHaveBeenCalled()
    h.destroy()
  })

  it('forwards jarvis:user:confirmed → screen emit user:confirmed', () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('jarvis:user:confirmed')
    expect(emit).toHaveBeenCalledWith('user:confirmed')
    h.destroy()
  })

  it('forwards jarvis:user:cancelled → screen emit user:cancelled', () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('jarvis:user:cancelled')
    expect(emit).toHaveBeenCalledWith('user:cancelled')
    h.destroy()
  })

  it('forwards jarvis:speak from ScreenAgent to globalEmitter', () => {
    const h = makeHandler()
    h.init()
    const speakHandler = on.mock.calls.find((c) => c[0] === 'jarvis:speak')?.[1] as (
      p: { text: string; priority: 'low' | 'normal' | 'high' },
    ) => void
    expect(speakHandler).toBeDefined()
    const spy = jest.spyOn(globalEmitter, 'emit')
    speakHandler({ text: 'hi', priority: 'normal' })
    expect(spy).toHaveBeenCalledWith('jarvis:speak', { text: 'hi', priority: 'normal' })
    h.destroy()
  })

  it('destroy() unhooks intent and voice listeners', () => {
    const h = makeHandler()
    h.init()
    const intentsBefore = globalEmitter.listenerCount('intent:resolved')
    expect(intentsBefore).toBeGreaterThan(0)
    h.destroy()
    expect(globalEmitter.listenerCount('intent:resolved')).toBe(0)
    expect(globalEmitter.listenerCount('jarvis:user:confirmed')).toBe(0)
    expect(globalEmitter.listenerCount(EVT_BEHAVIOUR_SUGGESTION)).toBe(0)
    expect(globalEmitter.listenerCount(EVT_BEHAVIOUR_ACCEPT)).toBe(0)
  })

  it('unknown intent does not call setMode', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'something.else' })
    await Promise.resolve()
    expect(setMode).not.toHaveBeenCalled()
    h.destroy()
  })

  it('jarvis.screen.act without goal logs and skips setMode', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.act', slots: {} })
    await Promise.resolve()
    expect(setMode).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
    h.destroy()
  })

  function suggestionBase(
    suggestedIntent: string,
    activeApp: string | null = null,
  ): BehaviourSuggestionEvent {
    return {
      type: 'behaviour:suggestion',
      sessionId: 'sess',
      suggestedIntent,
      confidence: 0.82,
      reasons: ['Often follows last intent (x)'],
      context: {
        recentIntents: ['jarvis.screen.watch'],
        activeApp,
        timeOfDay: 'morning',
        dayOfWeek: 1,
      },
      createdAt: Date.now(),
    }
  }

  it('intentResolvedFromBehaviourSuggestion maps act + browser app to browser goal', () => {
    const p = intentResolvedFromBehaviourSuggestion(
      suggestionBase('jarvis.screen.act', 'Google Chrome'),
    )
    expect(p).toEqual({
      intent: 'jarvis.screen.act',
      slots: { goal: BEHAVIOUR_ACT_GOAL_BROWSER },
      utterance: BEHAVIOUR_ACT_GOAL_BROWSER,
    })
  })

  it('intentResolvedFromBehaviourSuggestion maps act + non-browser to default goal', () => {
    const p = intentResolvedFromBehaviourSuggestion(suggestionBase('jarvis.screen.act', 'Code'))
    expect(p).toEqual({
      intent: 'jarvis.screen.act',
      slots: { goal: BEHAVIOUR_ACT_GOAL_DEFAULT },
      utterance: BEHAVIOUR_ACT_GOAL_DEFAULT,
    })
  })

  it('jarvis:behaviour:suggestion emits jarvis:speak with spoken summary', () => {
    const h = makeHandler()
    h.init()
    const spy = jest.spyOn(globalEmitter, 'emit')
    globalEmitter.emit(EVT_BEHAVIOUR_SUGGESTION, suggestionBase('jarvis.screen.watch'))
    const speakCalls = spy.mock.calls.filter((c) => c[0] === 'jarvis:speak')
    expect(speakCalls.length).toBe(1)
    const payload = speakCalls[0]![1] as { text: string }
    expect(payload.text).toContain('Suggestion:')
    expect(payload.text).toContain('watch')
    h.destroy()
    spy.mockRestore()
  })

  it('jarvis:behaviour:accept emits intent:resolved and routes like NLU', async () => {
    const h = makeHandler()
    h.init()
    const resolvedSpy = jest.spyOn(globalEmitter, 'emit')
    globalEmitter.emit(EVT_BEHAVIOUR_SUGGESTION, suggestionBase('jarvis.screen.advise'))
    resolvedSpy.mockClear()
    globalEmitter.emit(EVT_BEHAVIOUR_ACCEPT)
    const intentCalls = resolvedSpy.mock.calls.filter((c) => c[0] === 'intent:resolved')
    expect(intentCalls.length).toBe(1)
    expect(intentCalls[0]![1]).toEqual({ intent: 'jarvis.screen.advise' })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.ADVISE)
    h.destroy()
    resolvedSpy.mockRestore()
  })
})
